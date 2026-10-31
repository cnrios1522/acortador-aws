"""Acceso a DynamoDB. En EC2, boto3 usa el rol IAM de la instancia."""
import boto3
from .config import AWS_REGION, DYNAMODB_TABLE

_table = boto3.resource("dynamodb", region_name=AWS_REGION).Table(DYNAMODB_TABLE)


def save_url(record: dict) -> None:
    # La condición impide sobrescribir un código que ya exista.
    _table.put_item(
        Item=record,
        ConditionExpression="attribute_not_exists(short_code)",
    )


def find_url(short_code: str) -> dict | None:
    response = _table.get_item(Key={"short_code": short_code})
    return response.get("Item")
