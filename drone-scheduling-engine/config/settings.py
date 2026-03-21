import os
from pathlib import Path
from typing import Dict, Any
from dataclasses import dataclass, field
from enum import Enum

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class DroneType(Enum):
    FIXED_ROUTE = "fixed_route"
    PERIODIC_PATROL = "periodic_patrol"
    EMERGENCY_RESCUE = "emergency_rescue"


class TaskPriority(Enum):
    EMERGENCY = 2.0
    PERIODIC = 1.0
    FIXED = 0.6


class RegionType(Enum):
    COMMERCIAL = "commercial"
    RESIDENTIAL = "residential"
    INDUSTRIAL = "industrial"
    EMERGENCY = "emergency"


@dataclass
class DroneConfig:
    FIXED_ROUTE: Dict[str, Any] = field(default_factory=lambda: {
        "max_energy": 5000,
        "energy_consumption_rate": 0.5,
        "speed": 15.0,
        "task_priority": TaskPriority.FIXED.value,
        "patrol_interval": 3600,
    })
    PERIODIC_PATROL: Dict[str, Any] = field(default_factory=lambda: {
        "max_energy": 4500,
        "energy_consumption_rate": 0.6,
        "speed": 12.0,
        "task_priority": TaskPriority.PERIODIC.value,
        "patrol_interval": 1800,
    })
    EMERGENCY_RESCUE: Dict[str, Any] = field(default_factory=lambda: {
        "max_energy": 6000,
        "energy_consumption_rate": 0.8,
        "speed": 25.0,
        "task_priority": TaskPriority.EMERGENCY.value,
        "patrol_interval": 0,
    })


@dataclass
class NestConfig:
    default_capacity: int = 4
    charging_power: float = 1500.0
    max_charging_power: float = 2000.0
    min_available_slots: int = 1


@dataclass
class CityConfig:
    name: str = "Hefei"
    center_lat: float = 31.8206
    center_lon: float = 117.2272
    grid_size: float = 0.01
    num_nests: int = 150
    region_distribution: Dict[str, float] = field(default_factory=lambda: {
        RegionType.COMMERCIAL.value: 0.3,
        RegionType.RESIDENTIAL.value: 0.4,
        RegionType.INDUSTRIAL.value: 0.2,
        RegionType.EMERGENCY.value: 0.1,
    })


@dataclass
class AdvantageFunctionConfig:
    gamma: float = 0.97
    alpha: float = 0.6
    beta: float = 0.4
    time_decay_factor: float = 0.98


@dataclass
class SchedulerConfig:
    dispatch_interval: float = 2.0
    max_drones: int = 200
    max_nests: int = 50
    computation_timeout: float = 0.5


@dataclass
class GATConfig:
    input_dim: int = 32
    hidden_dim: int = 64
    output_dim: int = 16
    num_heads: int = 4
    num_layers: int = 3
    dropout: float = 0.1
    learning_rate: float = 0.001
    batch_size: int = 64
    epochs: int = 100


@dataclass
class DatabaseConfig:
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "drone_nest"
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "drone_logs"


@dataclass
class AmapConfig:
    api_key: str = ""
    security_key: str = ""
    base_url: str = "https://restapi.amap.com/v3"
    cache_enabled: bool = True
    cache_ttl: int = 3600


@dataclass
class Settings:
    drone: DroneConfig = field(default_factory=DroneConfig)
    nest: NestConfig = field(default_factory=NestConfig)
    city: CityConfig = field(default_factory=CityConfig)
    advantage_function: AdvantageFunctionConfig = field(default_factory=AdvantageFunctionConfig)
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    gat: GATConfig = field(default_factory=GATConfig)
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    amap: AmapConfig = field(default_factory=AmapConfig)
    
    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls()
        if os.getenv("MYSQL_HOST"):
            settings.database.mysql_host = os.getenv("MYSQL_HOST")
        if os.getenv("REDIS_HOST"):
            settings.database.redis_host = os.getenv("REDIS_HOST")
        if os.getenv("AMAP_API_KEY"):
            settings.amap.api_key = os.getenv("AMAP_API_KEY")
        if os.getenv("AMAP_SECURITY_KEY"):
            settings.amap.security_key = os.getenv("AMAP_SECURITY_KEY")
        return settings


settings = Settings.from_env()
