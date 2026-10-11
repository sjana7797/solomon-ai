from enum import StrEnum


class HeaderEnum(StrEnum):
    """
    Enum for HTTP headers used in the application.
    """

    AUTHORIZATION = "Authorization"


class ContentTypeEnum(StrEnum):
    """
    Enum for Content-Type headers used in the application.
    """

    APPLICATION_JSON = "application/json"
    TEXT_EVENT_STREAM = "text/event-stream"
