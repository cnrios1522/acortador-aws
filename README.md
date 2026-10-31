# Midterm: Acortador de enlaces en AWS

Arquitectura: navegador → frontend estático S3 → `POST /shorten` en FastAPI/EC2 → DynamoDB. El backend crea un UUID y guarda `short_code`, `original_url` y `created_at`. Al abrir el enlace corto, `GET /{short_code}` consulta DynamoDB y responde con HTTP 307 (`Location: URL_original`).

## Estructura

- `backend/app/config.py`: variables de entorno.
- `backend/app/dynamo.py`: `PutItem` y `GetItem`.
- `backend/app/main.py`: endpoints y CORS.
- `frontend/index.html`, `styles.css`, `app.js`: interfaz para subir a S3.
- `deploy/iam-policy.json`: política mínima, editar cuenta/región.
- `deploy/acortador.service`: plantilla del servicio `systemd` para Ubuntu.

## 1. GitHub y VS Code (Windows)

1. Crear repositorio público o privado `acortador-aws` en GitHub. No subir credenciales.
2. En PowerShell, `git clone https://github.com/TU_USUARIO/acortador-aws.git` y `cd acortador-aws`.
3. Copiar dentro de ese repositorio todos los archivos y carpetas de este proyecto, preservando la estructura.
4. Abrir `code .` desde el directorio del repositorio.
5. Crear entorno Python:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
cd ..
```

Si PowerShell bloquea activación, ejecutar `Set-ExecutionPolicy -Scope Process Bypass` y reintentar, o usar `backend\.venv\Scripts\python.exe` directamente.

6. Primer commit:

```powershell
git add .
git commit -m "Acortador AWS con FastAPI, S3 y DynamoDB"
git push -u origin main
```

Si tu rama principal se llama diferente, sustituye `main` por la rama existente; si no tiene commit inicial, ejecuta `git branch -M main` antes de `git push`.

## 2. DynamoDB

AWS Console → DynamoDB → Tables → Create table. Nombre `short_urls`, partition key `short_code` tipo String. Sin sort key. Capacidad on-demand. Crear. Mantener la región, p. ej. `us-east-1`, consistente en todo.

## 3. Rol IAM para EC2

IAM → Policies → Create policy → JSON. Pegar `deploy/iam-policy.json`, reemplazar `TU_ACCOUNT_ID` por tu número real de cuenta de AWS y región si cambiase. Guardar como `PoliticaAcortadorDynamo`.

IAM → Roles → Create role → Trusted entity: AWS service, use case EC2 → adjuntar `PoliticaAcortadorDynamo` → nombrar `RolEC2Acortador`.

## 4. EC2 Ubuntu

EC2 → Launch instance: nombre `ec2-acortador`, AMI Ubuntu Server 24.04 (o equivalente compatible), instancia pequeña según costos/free tier, par de claves `.pem`, public IP habilitada. Asociar rol IAM `RolEC2Acortador` (durante lanzamiento o Actions → Security → Modify IAM role). Security Group inbound: SSH 22 desde *My IP* y TCP 8000 desde `0.0.0.0/0` solo para demostración. Outbound: permitir HTTPS 443 para DynamoDB/GitHub/paquetes.

Conectarse por SSH/EC2 Instance Connect. Instalar:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git curl
cd /home/ubuntu
git clone https://github.com/TU_USUARIO/acortador-aws.git
cd acortador-aws/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env
```

Editar variables en `.env`:

```ini
AWS_REGION=us-east-1
DYNAMODB_TABLE=short_urls
BASE_URL=http://IP_PUBLICA_EC2:8000
CORS_ORIGINS=http://BUCKET.s3-website-us-east-1.amazonaws.com
```

**Importante:** `CORS_ORIGINS` debe coincidir exactamente con el origen real de S3 (sin barra final, con `http://`, sin `/index.html`). Si aún no tienes bucket, usa un valor provisional y actualízalo después. `BASE_URL` debe usar la IP pública de EC2. Guarda `.env` (no hacer commit).

Probar:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Abrir `http://IP_PUBLICA_EC2:8000/docs`, crear `POST /shorten`, revisar la tabla DynamoDB (Explore table items). Presionar Ctrl+C para parar el servidor de prueba.

## 5. Persistencia con systemd

Desde cualquier directorio en EC2:

```bash
sudo cp /home/ubuntu/acortador-aws/deploy/acortador.service /etc/systemd/system/acortador.service
sudo systemctl daemon-reload
sudo systemctl enable --now acortador
sudo systemctl status acortador --no-pager
```

Si se cambian variables en `.env`, ejecutar `sudo systemctl restart acortador`. Logs: `sudo journalctl -u acortador -n 80 --no-pager`.

## 6. Publicar frontend en S3

1. Abrir `frontend/app.js` y cambiar `TU_IP_PUBLICA_EC2` por la IP pública real.
2. Subir la modificación al repositorio (`git add . && git commit -m "Configurar URL pública API" && git push`).
3. S3 → Create bucket → un nombre globalmente único, por ejemplo `acortador-midterm-TU_ALUMNO-2026`, misma región.
4. Properties → Static website hosting → Enable → index document `index.html`. Copiar **Bucket website endpoint** (es HTTP, no HTTPS).
5. Para la demostración con sitio público: Permissions → Block public access → editar opciones del bucket, desactivar bloqueo público que impide la política y confirmar. Revisar si una restricción a nivel cuenta lo impide.
6. Permissions → Bucket policy. Reemplazar `NOMBRE_BUCKET`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadWebOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::NOMBRE_BUCKET/*"
    }
  ]
}
```

7. Upload → subir los archivos **dentro** de `frontend/` (`index.html`, `styles.css`, `app.js`) en la raíz del bucket, no la carpeta `frontend`.
8. Abrir el **Bucket website endpoint** en el navegador.
9. En EC2 editar `backend/.env`, poniendo el origen exacto de S3 en `CORS_ORIGINS`. Reiniciar: `sudo systemctl restart acortador`.

**HTTP:** un website endpoint de S3 solo habla HTTP. Con `http://EC2_IP:8000` también usas HTTP y evitas bloqueos de contenido mixto. Esta solución simple es solo de clase/demostración. Para producción hay que usar HTTPS en ambos extremos (por ejemplo CloudFront para frontend y HTTPS para API por dominio/proxy/load balancer). El portapapeles de navegadores puede restringir HTTP; el botón de copiar intenta un método alternativo y selecciona el enlace para `Ctrl+C` si falla.

## 7. Verificación final

- En `http://IP_PUBLICA_EC2:8000/docs`: `POST /shorten` con `https://www.example.com`; copiar UUID y verificar que aparece en DynamoDB.
- `GET /urls/{UUID}` debe devolver JSON con los 3 datos.
- Abrir en el navegador `http://IP_PUBLICA_EC2:8000/{UUID}` debe navegar automáticamente hacia `example.com`.
- `GET /urls/uuid-inexistente` responde 404; `GET /uuid-inexistente` responde 404.
- En la interfaz S3 crear un enlace, pulsar copiar y abrir enlace.
- Comprobar `systemctl is-active acortador`, reiniciar EC2 y repetir pruebas.
- Importante: la IP pública automática de EC2 puede cambiar tras detener/iniciar la instancia. Para un enlace estable se necesitaría Elastic IP u otro dominio/punto de entrada, con posibles costos.

Para probar que el redirect es HTTP 307, en una terminal:

```bash
curl -I http://IP_PUBLICA_EC2:8000/UUID
```

**Nota:** FastAPI `@app.get` no declara `HEAD` automáticamente de forma universal; si `curl -I` devuelve 405, usar:

```bash
curl -s -D - -o /dev/null http://IP_PUBLICA_EC2:8000/UUID
```

Esto debe mostrar `HTTP/1.1 307 Temporary Redirect` y `location: https://www.example.com/`.

## 8. Qué mostrar en el video

1. Repositorio GitHub y estructura.
2. Tabla DynamoDB: clave `short_code` (String).
3. Rol IAM EC2: política solo `PutItem` y `GetItem`, sin credenciales en archivos.
4. EC2: IP pública, reglas de seguridad 22/8000, `systemd` activo.
5. API: Swagger `POST /shorten` y UUID generado.
6. DynamoDB: registro con `short_code`, `original_url`, `created_at`.
7. S3: `index.html`, `styles.css`, `app.js`, configuración hosting y URL pública.
8. Desde la web crear/copiar/abrir enlace y mostrar redirección; consultar `/urls/{UUID}` y 404 inexistente.
9. Reiniciar backend y probar que sigue funcionando.

## Problemas frecuentes

- **CORS:** origen exacto de S3 debe aparecer en `.env` de EC2, reiniciar servicio.
- **500/503:** revisar rol IAM, política con región/cuenta correcta, tabla y `journalctl`.
- **Timeout:** comprobar IP pública, security group 8000, servicio activo.
- **AccessDenied S3:** comprobar bucket policy, configuración de bloqueo público y ubicación raíz del `index.html`.
- **Mixed content:** no usar `https://` en frontend y `http://` en API a la vez.
- **Git:** nunca incluir `.env` ni claves en GitHub.

## Costos y seguridad

Revisa costos en tu cuenta AWS; EC2, IPv4 pública, DynamoDB y S3 pueden generar cargos aun en un proyecto académico. Limita SSH a tu IP. El puerto 8000 se abre temporalmente al público solo para esta demo. No introduzcas credenciales privadas, secretos ni URL sensibles: este proyecto es público y funciona por HTTP.
