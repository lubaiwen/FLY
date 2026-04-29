from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class DroneType(str, Enum):
    FIXED = "fixed"
    PERIODIC = "periodic"
    TEMPORARY = "temporary"


class DroneStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    ENROUTE = "enroute"
    WAITING = "waiting"
    CHARGING = "charging"
    FAILED = "failed"


class NestStatus(str, Enum):
    AVAILABLE = "available"
    FAULT = "fault"
    OFFLINE = "offline"


@dataclass
class Drone:
    id: str
    drone_type: DroneType
    x: float
    y: float
    battery: float
    max_battery: float
    speed: float
    energy_per_meter: float
    priority: int
    deadline: float
    status: DroneStatus = DroneStatus.IDLE
    target_nest: Optional[str] = None
    mission_x: Optional[float] = None
    mission_y: Optional[float] = None
    time_to_target: float = 0.0
    wait_time: float = 0.0
    completed_tasks: int = 0
    failed_tasks: int = 0
    distance_travelled: float = 0.0

    @property
    def battery_ratio(self) -> float:
        if self.max_battery <= 0:
            return 0.0
        return max(0.0, min(1.0, self.battery / self.max_battery))


@dataclass
class Nest:
    id: str
    x: float
    y: float
    capacity: int
    charge_rate: float
    status: NestStatus = NestStatus.AVAILABLE
    occupied: int = 0
    queue: list[str] = field(default_factory=list)
    utilization_time: float = 0.0
    completed_charges: int = 0

    @property
    def available_slots(self) -> int:
        if self.status is not NestStatus.AVAILABLE:
            return 0
        return max(0, self.capacity - self.occupied)
