import os
import json
import csv
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from dataclasses import asdict
from pathlib import Path
import time

from config import settings, DroneType
from models import Drone, Nest, Task, MatchingResult, SimulationState, DroneStatus
from simulation.city_environment import CityEnvironment
from simulation.drone_behavior import DroneFactory, DroneBehavior


class DataSimulator:
    
    def __init__(
        self,
        output_dir: str = "data/simulation",
        center_lat: float = None,
        center_lon: float = None,
        num_nests: int = 150,
        num_drones_fixed: int = 30,
        num_drones_periodic: int = 40,
        num_drones_emergency: int = 30,
    ):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.center_lat = center_lat or settings.city.center_lat
        self.center_lon = center_lon or settings.city.center_lon
        
        self.environment = CityEnvironment(
            center_lat=self.center_lat,
            center_lon=self.center_lon,
            num_nests=num_nests,
        )
        self.environment.generate_grid()
        self.nests = self.environment.generate_nests()
        
        self.drones, self.behaviors = DroneFactory.create_fleet(
            num_fixed_route=num_drones_fixed,
            num_periodic=num_drones_periodic,
            num_emergency=num_drones_emergency,
            center_lat=self.center_lat,
            center_lon=self.center_lon,
        )
        
        self.tasks: List[Task] = []
        self.matchings: List[MatchingResult] = []
        self.trajectory_data: List[Dict] = []
        self.energy_data: List[Dict] = []
        self.nest_usage_data: List[Dict] = []
        
        self.simulation_time = datetime.now()
        self.time_step = 1.0
        self.total_steps = 0
        
    def step(self) -> SimulationState:
        self.total_steps += 1
        self.simulation_time += timedelta(seconds=self.time_step)
        
        for drone in self.drones:
            behavior = self.behaviors.get(drone.id)
            if behavior:
                new_pos, energy_consumed, task = behavior.update(
                    drone, self.time_step, self.environment
                )
                
                drone.position = new_pos
                drone.energy -= energy_consumed
                drone.energy = max(0, drone.energy)
                drone.updated_at = self.simulation_time
                
                if task:
                    task.created_at = self.simulation_time
                    self.tasks.append(task)
                
                self._record_trajectory(drone, energy_consumed)
        
        self._update_nest_states()
        
        return self._get_current_state()
    
    def _record_trajectory(self, drone: Drone, energy_consumed: float):
        trajectory_record = {
            "timestamp": self.simulation_time.isoformat(),
            "drone_id": drone.id,
            "drone_type": drone.drone_type,
            "lat": drone.position.lat,
            "lon": drone.position.lon,
            "altitude": drone.position.altitude,
            "energy": drone.energy,
            "energy_consumed": energy_consumed,
            "status": drone.status.value,
            "remaining_ratio": drone.remaining_energy_ratio(),
        }
        self.trajectory_data.append(trajectory_record)
        
        energy_record = {
            "timestamp": self.simulation_time.isoformat(),
            "drone_id": drone.id,
            "drone_type": drone.drone_type,
            "energy": drone.energy,
            "energy_consumed": energy_consumed,
            "cumulative_energy": drone.max_energy - drone.energy,
        }
        self.energy_data.append(energy_record)
    
    def _update_nest_states(self):
        for nest in self.nests:
            usage_record = {
                "timestamp": self.simulation_time.isoformat(),
                "nest_id": nest.id,
                "available_slots": nest.available_slots(),
                "occupancy_rate": (nest.capacity - nest.available_slots()) / nest.capacity,
                "region_type": nest.region_type,
            }
            self.nest_usage_data.append(usage_record)
    
    def _get_current_state(self) -> SimulationState:
        return SimulationState(
            timestamp=self.simulation_time,
            drones=self.drones,
            nests=self.nests,
            tasks=self.tasks,
            matchings=self.matchings,
        )
    
    def run_simulation(self, duration_hours: float = 1000, progress_callback=None) -> SimulationState:
        total_seconds = duration_hours * 3600
        total_steps = int(total_seconds / self.time_step)
        
        start_time = time.time()
        
        for step in range(total_steps):
            self.step()
            
            if progress_callback and step % 1000 == 0:
                progress = step / total_steps * 100
                elapsed = time.time() - start_time
                eta = elapsed / (step + 1) * (total_steps - step)
                progress_callback(progress, elapsed, eta)
        
        return self._get_current_state()
    
    def export_to_csv(self):
        csv_dir = self.output_dir / "csv"
        csv_dir.mkdir(exist_ok=True)
        
        trajectory_file = csv_dir / "drone_trajectories.csv"
        with open(trajectory_file, "w", newline="", encoding="utf-8") as f:
            if self.trajectory_data:
                writer = csv.DictWriter(f, fieldnames=self.trajectory_data[0].keys())
                writer.writeheader()
                writer.writerows(self.trajectory_data)
        
        energy_file = csv_dir / "drone_energy.csv"
        with open(energy_file, "w", newline="", encoding="utf-8") as f:
            if self.energy_data:
                writer = csv.DictWriter(f, fieldnames=self.energy_data[0].keys())
                writer.writeheader()
                writer.writerows(self.energy_data)
        
        nest_file = csv_dir / "nest_usage.csv"
        with open(nest_file, "w", newline="", encoding="utf-8") as f:
            if self.nest_usage_data:
                writer = csv.DictWriter(f, fieldnames=self.nest_usage_data[0].keys())
                writer.writeheader()
                writer.writerows(self.nest_usage_data)
        
        drones_file = csv_dir / "drones.csv"
        with open(drones_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "id", "drone_type", "lat", "lon", "altitude", "energy", "max_energy",
                "energy_consumption_rate", "speed", "status", "task_priority"
            ])
            writer.writeheader()
            for drone in self.drones:
                writer.writerow({
                    "id": drone.id,
                    "drone_type": drone.drone_type,
                    "lat": drone.position.lat,
                    "lon": drone.position.lon,
                    "altitude": drone.position.altitude,
                    "energy": drone.energy,
                    "max_energy": drone.max_energy,
                    "energy_consumption_rate": drone.energy_consumption_rate,
                    "speed": drone.speed,
                    "status": drone.status.value,
                    "task_priority": drone.task_priority,
                })
        
        nests_file = csv_dir / "nests.csv"
        with open(nests_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "id", "name", "lat", "lon", "capacity", "available_slots",
                "status", "region_type", "demand_density", "historical_usage_rate"
            ])
            writer.writeheader()
            for nest in self.nests:
                writer.writerow({
                    "id": nest.id,
                    "name": nest.name,
                    "lat": nest.position.lat,
                    "lon": nest.position.lon,
                    "capacity": nest.capacity,
                    "available_slots": nest.available_slots(),
                    "status": nest.status.value,
                    "region_type": nest.region_type,
                    "demand_density": nest.demand_density,
                    "historical_usage_rate": nest.historical_usage_rate,
                })
        
        return csv_dir
    
    def export_to_json(self):
        json_dir = self.output_dir / "json"
        json_dir.mkdir(exist_ok=True)
        
        with open(json_dir / "drones.json", "w", encoding="utf-8") as f:
            json.dump([d.to_dict() for d in self.drones], f, ensure_ascii=False, indent=2)
        
        with open(json_dir / "nests.json", "w", encoding="utf-8") as f:
            json.dump([n.to_dict() for n in self.nests], f, ensure_ascii=False, indent=2)
        
        with open(json_dir / "tasks.json", "w", encoding="utf-8") as f:
            json.dump([t.to_dict() for t in self.tasks], f, ensure_ascii=False, indent=2)
        
        with open(json_dir / "environment.json", "w", encoding="utf-8") as f:
            json.dump(self.environment.to_dict(), f, ensure_ascii=False, indent=2)
        
        with open(json_dir / "nests_geojson.json", "w", encoding="utf-8") as f:
            json.dump(self.environment.export_to_geojson(), f, ensure_ascii=False, indent=2)
        
        trajectory_chunks = self._chunk_data(self.trajectory_data, 100000)
        for i, chunk in enumerate(trajectory_chunks):
            with open(json_dir / f"trajectories_{i}.json", "w", encoding="utf-8") as f:
                json.dump(chunk, f, ensure_ascii=False)
        
        return json_dir
    
    def _chunk_data(self, data: List[Dict], chunk_size: int) -> List[List[Dict]]:
        return [data[i:i + chunk_size] for i in range(0, len(data), chunk_size)]
    
    def export_all(self):
        csv_dir = self.export_to_csv()
        json_dir = self.export_to_json()
        return csv_dir, json_dir
    
    def get_statistics(self) -> Dict[str, Any]:
        total_energy_consumed = sum(
            drone.max_energy - drone.energy for drone in self.drones
        )
        
        avg_remaining_energy = sum(
            drone.remaining_energy_ratio() for drone in self.drones
        ) / len(self.drones) if self.drones else 0
        
        nest_stats = self.environment.calculate_region_statistics()
        
        return {
            "simulation_time": self.simulation_time.isoformat(),
            "total_steps": self.total_steps,
            "total_drones": len(self.drones),
            "total_nests": len(self.nests),
            "total_tasks": len(self.tasks),
            "total_energy_consumed": total_energy_consumed,
            "avg_remaining_energy": avg_remaining_energy,
            "region_statistics": nest_stats,
            "data_records": {
                "trajectory_records": len(self.trajectory_data),
                "energy_records": len(self.energy_data),
                "nest_usage_records": len(self.nest_usage_data),
            },
        }


def run_data_simulation(
    output_dir: str = "data/simulation",
    duration_hours: float = 1000,
    num_nests: int = 150,
    num_drones_fixed: int = 30,
    num_drones_periodic: int = 40,
    num_drones_emergency: int = 30,
):
    
    def progress_callback(progress, elapsed, eta):
        print(f"进度: {progress:.2f}%, 已用时: {elapsed:.1f}s, 预计剩余: {eta:.1f}s")
    
    simulator = DataSimulator(
        output_dir=output_dir,
        num_nests=num_nests,
        num_drones_fixed=num_drones_fixed,
        num_drones_periodic=num_drones_periodic,
        num_drones_emergency=num_drones_emergency,
    )
    
    print(f"开始模拟 {duration_hours} 小时的数据...")
    print(f"机槽数量: {num_nests}, 无人机数量: {num_drones_fixed + num_drones_periodic + num_drones_emergency}")
    
    simulator.run_simulation(
        duration_hours=duration_hours,
        progress_callback=progress_callback,
    )
    
    print("导出数据到CSV和JSON格式...")
    csv_dir, json_dir = simulator.export_all()
    
    stats = simulator.get_statistics()
    print(f"\n模拟统计:")
    print(f"  总步数: {stats['total_steps']}")
    print(f"  总能耗: {stats['total_energy_consumed']:.2f}")
    print(f"  平均剩余电量: {stats['avg_remaining_energy']*100:.2f}%")
    print(f"  轨迹记录数: {stats['data_records']['trajectory_records']}")
    
    with open(simulator.output_dir / "simulation_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    
    return simulator


if __name__ == "__main__":
    run_data_simulation(duration_hours=10)
