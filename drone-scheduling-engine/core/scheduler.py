import asyncio
import time
from typing import List, Dict, Optional, Callable, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import numpy as np

from config import settings
from models import Drone, Nest, MatchingResult, DroneStatus, NestStatus
from algorithms import (
    MatchingEngine,
    AdvantageMatrixBuilder,
    AdvantageFunction,
    PriorityHandler,
    EnergyCalculator,
)


class SchedulerState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"


@dataclass
class SchedulingResult:
    timestamp: datetime
    matched_pairs: List[MatchingResult]
    total_advantage: float
    computation_time: float
    drones_matched: int
    nests_used: int
    energy_saved: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "matched_pairs": [m.to_dict() for m in self.matched_pairs],
            "total_advantage": self.total_advantage,
            "computation_time": self.computation_time,
            "drones_matched": self.drones_matched,
            "nests_used": self.nests_used,
            "energy_saved": self.energy_saved,
        }


@dataclass
class SchedulerMetrics:
    total_schedules: int = 0
    total_matchings: int = 0
    avg_computation_time: float = 0.0
    avg_advantage: float = 0.0
    total_energy_saved: float = 0.0
    emergency_responses: int = 0
    
    def update(self, result: SchedulingResult):
        self.total_schedules += 1
        self.total_matchings += result.drones_matched
        
        n = self.total_schedules
        self.avg_computation_time = (
            (self.avg_computation_time * (n - 1) + result.computation_time) / n
        )
        self.avg_advantage = (
            (self.avg_advantage * (n - 1) + result.total_advantage) / n
        )
        self.total_energy_saved += result.energy_saved
    
    def to_dict(self) -> Dict:
        return {
            "total_schedules": self.total_schedules,
            "total_matchings": self.total_matchings,
            "avg_computation_time": self.avg_computation_time,
            "avg_advantage": self.avg_advantage,
            "total_energy_saved": self.total_energy_saved,
            "emergency_responses": self.emergency_responses,
        }


class ChargingRequest:
    
    def __init__(self, drone: Drone, timestamp: datetime = None):
        self.drone = drone
        self.timestamp = timestamp or datetime.now()
        self.priority = drone.task_priority
        self.urgency = self._calculate_urgency()
    
    def _calculate_urgency(self) -> float:
        remaining = self.drone.remaining_energy_ratio()
        if remaining < 0.1:
            return 10.0
        elif remaining < 0.2:
            return 5.0
        elif remaining < 0.3:
            return 2.0
        else:
            return 1.0
    
    def __lt__(self, other: "ChargingRequest") -> bool:
        if self.priority != other.priority:
            return self.priority > other.priority
        return self.urgency > other.urgency


class SchedulingEngine:
    
    def __init__(
        self,
        dispatch_interval: float = None,
        algorithm: str = "km",
        use_gat_predictor: bool = False,
    ):
        self.dispatch_interval = dispatch_interval or settings.scheduler.dispatch_interval
        self.algorithm = algorithm
        self.use_gat_predictor = use_gat_predictor
        
        self.matching_engine = MatchingEngine()
        self.advantage_function = AdvantageFunction()
        self.matrix_builder = AdvantageMatrixBuilder(self.advantage_function)
        
        self.state = SchedulerState.IDLE
        self.metrics = SchedulerMetrics()
        
        self.charging_requests: List[ChargingRequest] = []
        self.pending_drones: List[Drone] = []
        
        self._on_matching_callback: Optional[Callable] = None
        self._on_state_change_callback: Optional[Callable] = None
        
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()
    
    def set_matching_callback(self, callback: Callable[[SchedulingResult], None]):
        self._on_matching_callback = callback
    
    def set_state_change_callback(self, callback: Callable[[SchedulerState], None]):
        self._on_state_change_callback = callback
    
    def set_future_value_predictor(self, predictor):
        self.advantage_function.set_future_value_predictor(predictor)
    
    def add_charging_request(self, drone: Drone):
        request = ChargingRequest(drone)
        self.charging_requests.append(request)
        self.charging_requests.sort()
    
    def remove_charging_request(self, drone_id: str):
        self.charging_requests = [
            r for r in self.charging_requests if r.drone.id != drone_id
        ]
    
    def get_pending_drones(self, drones: List[Drone]) -> List[Drone]:
        pending = []
        for drone in drones:
            if self._should_request_charging(drone):
                pending.append(drone)
        return pending
    
    def _should_request_charging(self, drone: Drone) -> bool:
        if drone.status == DroneStatus.CHARGING:
            return False
        
        remaining = drone.remaining_energy_ratio()
        
        threshold_map = {
            "emergency_rescue": 0.2,
            "periodic_patrol": 0.25,
            "fixed_route": 0.3,
        }
        
        threshold = threshold_map.get(drone.drone_type, 0.3)
        return remaining < threshold
    
    def schedule(
        self,
        drones: List[Drone],
        nests: List[Nest],
    ) -> SchedulingResult:
        start_time = time.time()
        
        pending_drones = self.get_pending_drones(drones)
        
        available_nests = [n for n in nests if n.is_available()]
        
        if not pending_drones or not available_nests:
            return SchedulingResult(
                timestamp=datetime.now(),
                matched_pairs=[],
                total_advantage=0.0,
                computation_time=time.time() - start_time,
                drones_matched=0,
                nests_used=0,
            )
        
        advantage_matrix, travel_times, energy_costs = self.matrix_builder.build_matrix(
            pending_drones, available_nests
        )
        
        matching_pairs = self.matching_engine.match_drones_to_nests(
            pending_drones,
            available_nests,
            advantage_matrix,
            algorithm=self.algorithm,
            timeout=settings.scheduler.computation_timeout,
        )
        
        matching_results = self.matching_engine.create_matching_results(
            matching_pairs,
            pending_drones,
            available_nests,
            travel_times,
            energy_costs,
        )
        
        total_advantage = sum(m.weight for m in matching_pairs)
        
        energy_saved = self._calculate_energy_savings(
            pending_drones, available_nests, matching_pairs, advantage_matrix
        )
        
        result = SchedulingResult(
            timestamp=datetime.now(),
            matched_pairs=matching_results,
            total_advantage=total_advantage,
            computation_time=time.time() - start_time,
            drones_matched=len(matching_pairs),
            nests_used=len(set(m.nest_id for m in matching_pairs)),
            energy_saved=energy_saved,
        )
        
        self.metrics.update(result)
        
        if self._on_matching_callback:
            self._on_matching_callback(result)
        
        return result
    
    def _calculate_energy_savings(
        self,
        drones: List[Drone],
        nests: List[Nest],
        matching_pairs: List,
        advantage_matrix: np.ndarray,
    ) -> float:
        if not matching_pairs:
            return 0.0
        
        optimal_energy = 0.0
        greedy_energy = 0.0
        
        for pair in matching_pairs:
            i = next(idx for idx, d in enumerate(drones) if d.id == pair.drone_id)
            j = next(idx for idx, n in enumerate(nests) if n.id == pair.nest_id)
            
            distance = drones[i].position.distance_to(nests[j].position)
            optimal_energy += distance * drones[i].energy_consumption_rate
            
            min_distance = float('inf')
            for nest in nests:
                if nest.is_available():
                    d = drones[i].position.distance_to(nest.position)
                    min_distance = min(min_distance, d)
            
            if min_distance < float('inf'):
                greedy_energy += min_distance * drones[i].energy_consumption_rate
        
        return max(0, greedy_energy - optimal_energy)
    
    async def start_continuous_scheduling(
        self,
        get_drones: Callable[[], List[Drone]],
        get_nests: Callable[[], List[Nest]],
        apply_matchings: Callable[[List[MatchingResult]], None],
    ):
        self.state = SchedulerState.RUNNING
        self._stop_event.clear()
        
        if self._on_state_change_callback:
            self._on_state_change_callback(self.state)
        
        while not self._stop_event.is_set():
            try:
                drones = get_drones()
                nests = get_nests()
                
                result = self.schedule(drones, nests)
                
                if result.matched_pairs:
                    apply_matchings(result.matched_pairs)
                
                await asyncio.sleep(self.dispatch_interval)
                
            except Exception as e:
                print(f"Scheduling error: {e}")
                await asyncio.sleep(1.0)
    
    def stop(self):
        self._stop_event.set()
        self.state = SchedulerState.STOPPED
        
        if self._on_state_change_callback:
            self._on_state_change_callback(self.state)
    
    def pause(self):
        if self.state == SchedulerState.RUNNING:
            self.state = SchedulerState.PAUSED
            if self._on_state_change_callback:
                self._on_state_change_callback(self.state)
    
    def resume(self):
        if self.state == SchedulerState.PAUSED:
            self.state = SchedulerState.RUNNING
            if self._on_state_change_callback:
                self._on_state_change_callback(self.state)
    
    def get_metrics(self) -> Dict:
        return self.metrics.to_dict()
    
    def get_status(self) -> Dict:
        return {
            "state": self.state.value,
            "dispatch_interval": self.dispatch_interval,
            "algorithm": self.algorithm,
            "pending_requests": len(self.charging_requests),
            "metrics": self.get_metrics(),
        }


class RealTimeScheduler:
    
    def __init__(self, scheduling_engine: SchedulingEngine = None):
        self.engine = scheduling_engine or SchedulingEngine()
        self.drones: Dict[str, Drone] = {}
        self.nests: Dict[str, Nest] = {}
        self.matchings: Dict[str, str] = {}
        
        self._update_callbacks: List[Callable] = []
    
    def add_update_callback(self, callback: Callable):
        self._update_callbacks.append(callback)
    
    def update_drone(self, drone: Drone):
        self.drones[drone.id] = drone
        self._notify_update("drone", drone)
    
    def update_nest(self, nest: Nest):
        self.nests[nest.id] = nest
        self._notify_update("nest", nest)
    
    def remove_drone(self, drone_id: str):
        if drone_id in self.drones:
            del self.drones[drone_id]
            self._notify_update("drone_removed", {"id": drone_id})
    
    def remove_nest(self, nest_id: str):
        if nest_id in self.nests:
            del self.nests[nest_id]
            self._notify_update("nest_removed", {"id": nest_id})
    
    def get_all_drones(self) -> List[Drone]:
        return list(self.drones.values())
    
    def get_all_nests(self) -> List[Nest]:
        return list(self.nests.values())
    
    def apply_matchings(self, matching_results: List[MatchingResult]):
        for result in matching_results:
            self.matchings[result.drone_id] = result.nest_id
            
            if result.drone_id in self.drones:
                drone = self.drones[result.drone_id]
                drone.assigned_nest_id = result.nest_id
                drone.status = DroneStatus.RETURNING
            
            if result.nest_id in self.nests:
                nest = self.nests[result.nest_id]
                nest.occupy_slot(result.drone_id)
        
        self._notify_update("matchings", [m.to_dict() for m in matching_results])
    
    def complete_charging(self, drone_id: str):
        if drone_id in self.matchings:
            nest_id = self.matchings[drone_id]
            
            if drone_id in self.drones:
                drone = self.drones[drone_id]
                drone.energy = drone.max_energy
                drone.status = DroneStatus.IDLE
                drone.assigned_nest_id = None
            
            if nest_id in self.nests:
                nest = self.nests[nest_id]
                for slot in nest.slots:
                    if slot.drone_id == drone_id:
                        nest.release_slot(slot.slot_id)
                        break
            
            del self.matchings[drone_id]
            
            self._notify_update("charging_complete", {"drone_id": drone_id, "nest_id": nest_id})
    
    def _notify_update(self, event_type: str, data: Any):
        for callback in self._update_callbacks:
            try:
                callback(event_type, data)
            except Exception as e:
                print(f"Callback error: {e}")
    
    async def run(self):
        await self.engine.start_continuous_scheduling(
            get_drones=self.get_all_drones,
            get_nests=self.get_all_nests,
            apply_matchings=self.apply_matchings,
        )
    
    def stop(self):
        self.engine.stop()
    
    def get_state(self) -> Dict:
        return {
            "drones": {k: v.to_dict() for k, v in self.drones.items()},
            "nests": {k: v.to_dict() for k, v in self.nests.items()},
            "matchings": self.matchings,
            "scheduler": self.engine.get_status(),
        }
