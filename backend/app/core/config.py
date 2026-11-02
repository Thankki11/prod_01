from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    mysql_host: str = "db"
    mysql_port: int = 3306
    mysql_database: str = "diemdanh"
    mysql_user: str = "diemdanh"
    mysql_password: str

    secret_key: str
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    qr_rotate_seconds: int = 15
    app_timezone: str = "Asia/Ho_Chi_Minh"
    public_app_url: str = "http://localhost:5173"
    cors_origins: str = ""
    # Bật ở production (HTTPS) để cookie refresh token chỉ đi qua kết nối mã hoá
    cookie_secure: bool = False

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.app_timezone)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
