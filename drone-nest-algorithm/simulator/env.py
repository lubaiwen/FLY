from __future__ import annotations

from dataclasses import dataclass, field
import math
import random
from typing import Any, Mapping, Optional, Sequence

from .entities import Drone, DroneStatus, DroneType, Nest, NestStatus


DRONE_FEATURES = [
    "x",  # 无人机当前位置 x 坐标，按 world_size 归一化到 0-1
    "y",  # 无人机当前位置 y 坐标，按 world_size 归一化到 0-1
    "battery",  # 当前电量比例，battery / max_battery，范围 0-1
    "idle",  # 是否处于待调度状态；低电量且等待策略分配机槽时为 1
    "working",  # 是否正在外部随机飞行；只模拟移动耗电，不参与调度决策
    "enroute",  # 是否正在飞往被分配的机槽
    "waiting",  # 是否已经到达机槽但正在排队等待空位
    "charging",  # 是否正在机槽内充电
    "failed",  # 是否已经失败；例如电量耗尽或目标机槽不可用
    "type_fixed",  # 是否是固定任务无人机；低优先级任务类型 one-hot
    "type_periodic",  # 是否是周期任务无人机；中等优先级任务类型 one-hot
    "type_temporary",  # 是否是临时任务无人机；高优先级任务类型 one-hot
    "priority",  # 任务优先级，按最大优先级 5 归一化
    "deadline",  # 低电量处理时间压力，按 3600 秒归一化
    "mission_x",  # 当前外部随机飞行目标点 x 坐标，按 world_size 归一化
    "mission_y",  # 当前外部随机飞行目标点 y 坐标，按 world_size 归一化
]

NEST_FEATURES = [
    "x",  # 机槽当前位置 x 坐标，按 world_size 归一化到 0-1
    "y",  # 机槽当前位置 y 坐标，按 world_size 归一化到 0-1
    "available",  # 是否可用；可接收无人机或继续充电时为 1
    "fault",  # 是否故障；故障时不可接收无人机
    "offline",  # 是否离线；预留状态，离线时不可接收无人机
    "capacity",  # 总充电位数量，按默认最大容量 4 归一化
    "occupied",  # 当前已占用充电位比例，occupied / capacity
    "available_slots",  # 当前空闲充电位比例，available_slots / capacity
    "queue_length",  # 当前排队无人机数量，按无人机总数归一化
    "charge_rate",  # 每秒充电增量，按默认最大充电速率 0.006 归一化
    "utilization_time",  # 累计槽位占用时间，按单轮最大可用槽位时间归一化
    "completed_charges",  # 已完成充电次数，按无人机总数归一化
]

EDGE_FEATURES = [
    "distance",
    "energy_cost",
    "travel_time",
    "queue_wait",
    "battery_after_arrival",
    "reachable",
    "slot_available",
    "priority_pressure",
]

FIXED_NEST_SPECS = [
    (0.12, 0.16, 3, 0.0048),  # N000：西南区域，容量中等，充电较快
    (0.36, 0.12, 2, 0.0036),  # N001：南部偏西，容量较小，充电中等
    (0.64, 0.18, 4, 0.0055),  # N002：南部偏东，容量较大，充电快
    (0.88, 0.14, 2, 0.0032),  # N003：东南区域，容量较小，充电较慢
    (0.18, 0.58, 3, 0.0042),  # N004：西部中北，容量中等，充电中等
    (0.43, 0.74, 4, 0.0058),  # N005：北部偏西，容量较大，充电最快
    (0.70, 0.56, 2, 0.0038),  # N006：东部中区，容量较小，充电中等
    (0.91, 0.80, 3, 0.0046),  # N007：东北区域，容量中等，充电较快
]


@dataclass
class RewardConfig:
    invalid_action: float = -5.0  # 减分：选择非法机巢、不可达机巢或当前不能执行的动作
    unnecessary_dispatch: float = -2.0  # 减分：电量不低却被派去充电，抑制无意义调度
    dispatch_base: float = 1.0  # 加分：合法派出无人机去机巢的基础奖励
    dispatch_low_battery_bonus: float = 2.0  # 加分：越低电量越鼓励及时派去充电
    dispatch_priority_bonus: float = 0.5  # 加分：高优先级无人机被调度时额外奖励
    dispatch_distance_penalty: float = -1.5  # 减分：派往更远机巢的距离惩罚
    arrive_charging_base: float = 3.0  # 加分：无人机到达机巢并直接开始充电
    arrive_charging_priority_bonus: float = 0.5  # 加分：高优先级无人机开始充电的额外奖励
    arrive_queue: float = -1.0  # 减分：到达机巢但无空位，只能进入等待队列
    waiting_per_step_per_priority: float = -0.03  # 减分：无人机每等待一步都扣分，按优先级放大
    idle_low_battery_per_priority: float = -0.08  # 减分：低电量无人机仍处于空闲未处理状态
    charging_utilization_per_slot: float = 0.02  # 加分：机巢每个被占用充电槽位带来利用率奖励
    queue_to_charging: float = 1.0  # 加分：排队无人机成功进入充电状态
    complete_charge_base: float = 10.0  # 加分：无人机完成一次充电任务
    complete_charge_priority_bonus: float = 2.0  # 加分：高优先级无人机完成充电的额外奖励
    deadline_miss_per_priority: float = -0.3  # 减分：低电量无人机超过任务时间压力仍未解决
    nest_fault_event: float = -0.5  # 减分：机巢随机故障事件带来的系统损失
    failure_per_priority: float = -30.0  # 减分：无人机失败，如电量耗尽或目标机巢不可用


@dataclass
class EnvConfig:
    num_drones: int = 24
    num_nests: int = 8
    world_size: float = 10_000.0
    max_steps: int = 2880  # 一天训练窗口：2880步 * 30秒 = 24小时
    dt: float = 30.0
    min_safe_battery: float = 0.08
    low_battery_threshold: float = 0.35
    hover_energy_factor: float = 0.35  # 悬停等待耗电系数：约为巡航飞行单位时间耗电的 35%
    fault_probability: float = 0.005
    repair_probability: float = 0.02
    seed: Optional[int] = None
    reward: RewardConfig = field(default_factory=RewardConfig)


@dataclass
class GraphObservation:
    drone_features: list[list[float]]
    nest_features: list[list[float]]
    adjacency: list[list[int]]
    flat_observation: list[float]
    edge_index: list[tuple[int, int]]
    edge_features: list[list[float]]
    action_mask: list[list[int]]
    drone_ids: list[str]
    nest_ids: list[str]
    step: int
    time: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "drone_features": self.drone_features,
            "nest_features": self.nest_features,
            "adjacency": self.adjacency,
            "flat_observation": self.flat_observation,
            "edge_index": self.edge_index,
            "edge_features": self.edge_features,
            "action_mask": self.action_mask,
            "drone_ids": self.drone_ids,
            "nest_ids": self.nest_ids,
            "step": self.step,
            "time": self.time,
        }


class DroneChargingEnv:
    """Graph-friendly shared charging-nest simulator for GAT + PPO training."""

    def __init__(self, config: Optional[EnvConfig] = None):
        self.config = config or EnvConfig()
        self.rng = random.Random(self.config.seed)
        self.drones: list[Drone] = []
        self.nests: list[Nest] = []
        self.step_count = 0
        self.time = 0.0
        self.metrics: dict[str, float] = {}

    @property
    def action_size(self) -> int:
        return len(self.nests)

    def reset(self, seed: Optional[int] = None) -> GraphObservation:
        if seed is not None:
            self.rng.seed(seed)

        self.step_count = 0
        self.time = 0.0
        self.metrics = {
            "completed": 0.0,
            "failed": 0.0,
            "invalid_actions": 0.0,
            "total_reward": 0.0,
            "total_wait_time": 0.0,
            "total_distance": 0.0,
        }

        self.nests = [self._make_nest(i) for i in range(self.config.num_nests)]
        self.drones = [self._make_drone(i) for i in range(self.config.num_drones)]
        return self.get_observation()

    def step(
        self,
        actions: Sequence[int] | Mapping[str, int | str | None],
    ) -> tuple[GraphObservation, float, bool, dict[str, Any]]:
        action_list = self._normalize_actions(actions)
        mask = self._action_mask()
        reward = 0.0

        for drone_idx, nest_idx in enumerate(action_list):
            drone = self.drones[drone_idx]
            if drone.status is not DroneStatus.IDLE:
                continue

            if not any(mask[drone_idx]):
                continue

            if nest_idx < 0 or nest_idx >= len(self.nests) or not mask[drone_idx][nest_idx]:
                self.metrics["invalid_actions"] += 1
                reward += self.config.reward.invalid_action
                continue

            nest = self.nests[nest_idx]
            reward += self._assign_drone(drone, nest)

        reward += self._advance_simulation()
        reward += self._update_events()

        self.step_count += 1
        self.time += self.config.dt
        done = self.step_count >= self.config.max_steps
        info = self._info()
        self.metrics["total_reward"] += reward

        return self.get_observation(), reward, done, info

    def get_observation(self) -> GraphObservation:
        drone_features = [self._drone_features(drone) for drone in self.drones]
        nest_features = [self._nest_features(nest) for nest in self.nests]
        action_mask = self._action_mask()
        adjacency = self._policy_adjacency(action_mask)

        edge_index: list[tuple[int, int]] = []
        edge_features: list[list[float]] = []
        for drone_idx, drone in enumerate(self.drones):
            for nest_idx, nest in enumerate(self.nests):
                edge_index.append((drone_idx, len(self.drones) + nest_idx))
                edge_features.append(self._edge_features(drone, nest))

        flat_observation = self._flatten_observation(
            drone_features,
            nest_features,
            adjacency,
        )

        return GraphObservation(
            drone_features=drone_features,
            nest_features=nest_features,
            adjacency=adjacency,
            flat_observation=flat_observation,
            edge_index=edge_index,
            edge_features=edge_features,
            action_mask=action_mask,
            drone_ids=[d.id for d in self.drones],
            nest_ids=[n.id for n in self.nests],
            step=self.step_count,
            time=self.time,
        )

    def sample_random_action(self, obs: Optional[GraphObservation] = None) -> list[int]:
        obs = obs or self.get_observation()
        actions = []
        for row in obs.action_mask:
            valid = [idx for idx, allowed in enumerate(row) if allowed]
            actions.append(self.rng.choice(valid) if valid else self.rng.randrange(len(self.nests)))
        return actions

    def render_state(self) -> str:
        active = sum(1 for d in self.drones if d.status is not DroneStatus.FAILED)
        working = sum(1 for d in self.drones if d.status is DroneStatus.WORKING)
        charging = sum(1 for d in self.drones if d.status is DroneStatus.CHARGING)
        waiting = sum(1 for d in self.drones if d.status is DroneStatus.WAITING)
        return (
            f"step={self.step_count} active={active} working={working} "
            f"charging={charging} waiting={waiting} completed={self.metrics['completed']:.0f} "
            f"failed={self.metrics['failed']:.0f}"
        )

    def _make_nest(self, index: int) -> Nest:
        if index >= len(FIXED_NEST_SPECS):
            raise ValueError(
                f"nest index {index} has no fixed spec; add it to FIXED_NEST_SPECS"
            )
        x_ratio, y_ratio, capacity, charge_rate = FIXED_NEST_SPECS[index]
        return Nest(
            id=f"N{index:03d}",
            x=x_ratio * self.config.world_size,
            y=y_ratio * self.config.world_size,
            capacity=capacity,
            charge_rate=charge_rate,
        )

    def _make_drone(self, index: int) -> Drone:
        drone_type = self.rng.choice(list(DroneType))
        max_battery = self.rng.uniform(0.85, 1.15)
        battery = self.rng.uniform(0.25, 1.0) * max_battery
        drone = Drone(
            id=f"D{index:03d}",
            drone_type=drone_type,
            x=self.rng.uniform(0, self.config.world_size),
            y=self.rng.uniform(0, self.config.world_size),
            battery=battery,
            max_battery=max_battery,
            speed=self.rng.uniform(12.0, 22.0),
            energy_per_meter=self.rng.uniform(0.000025, 0.000055),
            priority=self._priority_for_type(drone_type),
            deadline=self.rng.uniform(600.0, 3600.0),
        )
        self._assign_external_flight_target(drone)
        if drone.battery_ratio > self.config.low_battery_threshold:
            drone.status = DroneStatus.WORKING
        return drone

    def _priority_for_type(self, drone_type: DroneType) -> int:
        if drone_type is DroneType.TEMPORARY:
            return self.rng.randint(3, 5)
        if drone_type is DroneType.PERIODIC:
            return self.rng.randint(2, 4)
        return self.rng.randint(1, 3)

    def _normalize_actions(
        self,
        actions: Sequence[int] | Mapping[str, int | str | None],
    ) -> list[int]:
        if isinstance(actions, Mapping):
            nest_lookup = {nest.id: idx for idx, nest in enumerate(self.nests)}
            normalized = []
            for drone in self.drones:
                value = actions.get(drone.id, -1)
                if value is None:
                    normalized.append(-1)
                elif isinstance(value, str):
                    normalized.append(nest_lookup.get(value, -1))
                else:
                    normalized.append(int(value))
            return normalized

        normalized = list(actions)
        if len(normalized) != len(self.drones):
            raise ValueError(
                f"expected {len(self.drones)} actions, got {len(normalized)}"
            )
        return [int(action) for action in normalized]

    def _assign_drone(self, drone: Drone, nest: Nest) -> float:
        reward_cfg = self.config.reward
        distance = self._distance(drone, nest)
        travel_time = distance / max(drone.speed, 1e-6)
        energy_cost = self._energy_cost(drone, distance)
        battery_before = drone.battery_ratio
        drone.status = DroneStatus.ENROUTE
        drone.target_nest = nest.id
        drone.time_to_target = travel_time
        drone.battery -= energy_cost
        drone.distance_travelled += distance
        self.metrics["total_distance"] += distance

        distance_norm = distance / self.config.world_size
        if battery_before <= self.config.low_battery_threshold:
            urgency = (
                self.config.low_battery_threshold - battery_before
            ) / self.config.low_battery_threshold
            return (
                reward_cfg.dispatch_base
                + reward_cfg.dispatch_low_battery_bonus * urgency
                + reward_cfg.dispatch_priority_bonus * drone.priority
                + reward_cfg.dispatch_distance_penalty * distance_norm
            )

        return reward_cfg.unnecessary_dispatch + (
            reward_cfg.dispatch_distance_penalty * distance_norm
        )

    def _advance_simulation(self) -> float:
        reward = 0.0
        dt = self.config.dt

        for drone in self.drones:
            if drone.status is DroneStatus.FAILED:
                continue

            drone.deadline = max(0.0, drone.deadline - dt)
            if drone.battery <= 0:
                reward += self._fail_drone(drone, "empty_battery")
                continue

            if drone.status is DroneStatus.ENROUTE:
                drone.time_to_target -= dt
                if drone.time_to_target <= 0:
                    reward += self._arrive_at_nest(drone)

            elif drone.status is DroneStatus.WORKING:
                reward += self._advance_external_flight(drone)

            elif drone.status is DroneStatus.WAITING:
                drone.wait_time += dt
                self.metrics["total_wait_time"] += dt
                drone.battery -= self._hover_energy_cost(drone, dt)
                if drone.battery <= 0:
                    reward += self._fail_drone(drone, "empty_battery_waiting")
                    continue
                reward += self.config.reward.waiting_per_step_per_priority * drone.priority

            elif drone.status is DroneStatus.CHARGING:
                nest = self._nest_by_id(drone.target_nest)
                if nest is None or nest.status is not NestStatus.AVAILABLE:
                    reward += self._fail_drone(drone, "nest_unavailable")
                    continue
                drone.battery = min(
                    drone.max_battery,
                    drone.battery + nest.charge_rate * dt,
                )
                if drone.battery >= drone.max_battery:
                    reward += self._complete_charge(drone, nest)

            elif drone.status is DroneStatus.IDLE:
                if self._needs_charge(drone):
                    reward += (
                        self.config.reward.idle_low_battery_per_priority
                        * drone.priority
                    )
                else:
                    self._assign_external_flight_target(drone)
                    drone.status = DroneStatus.WORKING

            if drone.deadline <= 0 and self._needs_charge(drone):
                reward += self.config.reward.deadline_miss_per_priority * drone.priority
                drone.deadline = self.rng.uniform(600.0, 3600.0)

        for nest in self.nests:
            nest.utilization_time += nest.occupied * dt
            if nest.status is NestStatus.AVAILABLE:
                reward += self.config.reward.charging_utilization_per_slot * nest.occupied
                reward += self._drain_queue(nest)

        return reward

    def _arrive_at_nest(self, drone: Drone) -> float:
        nest = self._nest_by_id(drone.target_nest)
        if nest is None or nest.status is not NestStatus.AVAILABLE:
            return self._fail_drone(drone, "bad_target")

        drone.x = nest.x
        drone.y = nest.y

        if nest.available_slots > 0:
            nest.occupied += 1
            drone.status = DroneStatus.CHARGING
            drone.wait_time = 0.0
            return (
                self.config.reward.arrive_charging_base
                + self.config.reward.arrive_charging_priority_bonus * drone.priority
            )

        drone.status = DroneStatus.WAITING
        if drone.id not in nest.queue:
            nest.queue.append(drone.id)
        return self.config.reward.arrive_queue

    def _complete_charge(self, drone: Drone, nest: Nest) -> float:
        nest.occupied = max(0, nest.occupied - 1)
        nest.completed_charges += 1
        drone.completed_tasks += 1
        drone.target_nest = None
        drone.time_to_target = 0.0
        drone.deadline = self.rng.uniform(600.0, 3600.0)
        self._assign_external_flight_target(drone)
        drone.status = DroneStatus.WORKING
        self.metrics["completed"] += 1
        return (
            self.config.reward.complete_charge_base
            + self.config.reward.complete_charge_priority_bonus * drone.priority
        )

    def _advance_external_flight(self, drone: Drone) -> float:
        if drone.mission_x is None or drone.mission_y is None:
            self._assign_external_flight_target(drone)

        dx = drone.mission_x - drone.x
        dy = drone.mission_y - drone.y
        distance = math.hypot(dx, dy)
        step_distance = min(distance, drone.speed * self.config.dt)

        if step_distance > 0:
            fraction = step_distance / max(distance, 1e-6)
            drone.x += dx * fraction
            drone.y += dy * fraction
            drone.battery -= self._energy_cost(drone, step_distance)
            drone.distance_travelled += step_distance
            self.metrics["total_distance"] += step_distance

        if drone.battery <= 0:
            return self._fail_drone(drone, "empty_battery")

        if distance <= step_distance + 1e-6:
            self._assign_external_flight_target(drone)

        if self._needs_charge(drone):
            drone.status = DroneStatus.IDLE
        return 0.0

    def _assign_external_flight_target(self, drone: Drone) -> None:
        target_x = self.rng.uniform(0, self.config.world_size)
        target_y = self.rng.uniform(0, self.config.world_size)
        dx = target_x - drone.x
        dy = target_y - drone.y
        target_distance = math.hypot(dx, dy)

        max_distance = self._external_flight_range(drone)
        if target_distance <= 1e-6 or max_distance <= 1e-6:
            drone.mission_x = drone.x
            drone.mission_y = drone.y
            return

        desired_distance = max_distance * self.rng.uniform(0.35, 0.85)
        if target_distance > desired_distance:
            fraction = desired_distance / target_distance
            target_x = drone.x + dx * fraction
            target_y = drone.y + dy * fraction

        drone.mission_x = max(0.0, min(self.config.world_size, target_x))
        drone.mission_y = max(0.0, min(self.config.world_size, target_y))

    def _external_flight_range(self, drone: Drone) -> float:
        reserve_energy = self.config.min_safe_battery * drone.max_battery
        usable_energy = max(0.0, drone.battery - reserve_energy)
        return usable_energy / max(drone.energy_per_meter, 1e-6)

    def _drain_queue(self, nest: Nest) -> float:
        reward = 0.0
        while nest.available_slots > 0 and nest.queue:
            drone_id = nest.queue.pop(0)
            drone = self._drone_by_id(drone_id)
            if drone is None or drone.status is DroneStatus.FAILED:
                continue
            nest.occupied += 1
            drone.status = DroneStatus.CHARGING
            reward += self.config.reward.queue_to_charging
        return reward

    def _update_events(self) -> float:
        reward = 0.0
        for nest in self.nests:
            if nest.status is NestStatus.AVAILABLE:
                if self.rng.random() < self.config.fault_probability:
                    nest.status = NestStatus.FAULT
                    reward += self.config.reward.nest_fault_event
            elif self.rng.random() < self.config.repair_probability:
                nest.status = NestStatus.AVAILABLE

        for drone in self.drones:
            if drone.status is DroneStatus.WORKING and self._needs_charge(drone):
                drone.status = DroneStatus.IDLE
        return reward

    def _fail_drone(self, drone: Drone, reason: str) -> float:
        _ = reason
        previous_target = drone.target_nest
        drone.status = DroneStatus.FAILED
        drone.target_nest = None
        drone.time_to_target = 0.0
        drone.failed_tasks += 1
        self.metrics["failed"] += 1

        if previous_target is not None:
            nest = self._nest_by_id(previous_target)
            if nest is not None:
                nest.queue = [item for item in nest.queue if item != drone.id]
        return self.config.reward.failure_per_priority * max(1, drone.priority)

    def _action_mask(self) -> list[list[int]]:
        mask: list[list[int]] = []
        for drone in self.drones:
            row = []
            for nest in self.nests:
                allowed = int(
                    drone.status is DroneStatus.IDLE
                    and nest.status is NestStatus.AVAILABLE
                    and self._battery_after_arrival(drone, nest)
                    >= self.config.min_safe_battery
                )
                row.append(allowed)
            mask.append(row)
        return mask

    def _policy_adjacency(self, action_mask: list[list[int]]) -> list[list[int]]:
        adjacency = []
        for row in action_mask:
            if any(row):
                adjacency.append(row)
            else:
                # 你的 GATPolicy 会用 adj 同时做注意力和动作 logits mask。
                # 全 0 行会让某架无人机没有任何可采样动作，所以无可调度边时给全 1。
                # 对非 IDLE/无可行机巢的无人机，环境 step 会忽略采样动作。
                adjacency.append([1 for _ in self.nests])
        return adjacency

    def _flatten_observation(
        self,
        drone_features: list[list[float]],
        nest_features: list[list[float]],
        adjacency: list[list[int]],
    ) -> list[float]:
        flat = []
        for row in drone_features:
            flat.extend(row)
        for row in nest_features:
            flat.extend(row)
        for row in adjacency:
            flat.extend(float(value) for value in row)
        return flat

    def _edge_features(self, drone: Drone, nest: Nest) -> list[float]:
        distance = self._distance(drone, nest)
        energy_cost = self._energy_cost(drone, distance)
        battery_after = drone.battery_ratio - energy_cost / max(drone.max_battery, 1e-6)
        travel_time = distance / max(drone.speed, 1e-6)
        queue_wait = len(nest.queue) * 300.0
        return [
            self._norm(distance, self.config.world_size * math.sqrt(2)),
            self._norm(energy_cost, max(drone.max_battery, 1e-6)),
            self._norm(travel_time, 3600.0),
            self._norm(queue_wait, 3600.0),
            max(0.0, min(1.0, battery_after)),
            float(battery_after >= self.config.min_safe_battery),
            float(nest.available_slots > 0),
            drone.priority / 5.0,
        ]

    def _drone_features(self, drone: Drone) -> list[float]:
        return [
            self._norm(drone.x, self.config.world_size),
            self._norm(drone.y, self.config.world_size),
            drone.battery_ratio,
            float(drone.status is DroneStatus.IDLE),
            float(drone.status is DroneStatus.WORKING),
            float(drone.status is DroneStatus.ENROUTE),
            float(drone.status is DroneStatus.WAITING),
            float(drone.status is DroneStatus.CHARGING),
            float(drone.status is DroneStatus.FAILED),
            float(drone.drone_type is DroneType.FIXED),
            float(drone.drone_type is DroneType.PERIODIC),
            float(drone.drone_type is DroneType.TEMPORARY),
            drone.priority / 5.0,
            self._norm(drone.deadline, 3600.0),
            self._norm(drone.mission_x or 0.0, self.config.world_size),
            self._norm(drone.mission_y or 0.0, self.config.world_size),
        ]

    def _nest_features(self, nest: Nest) -> list[float]:
        return [
            self._norm(nest.x, self.config.world_size),
            self._norm(nest.y, self.config.world_size),
            float(nest.status is NestStatus.AVAILABLE),
            float(nest.status is NestStatus.FAULT),
            float(nest.status is NestStatus.OFFLINE),
            self._norm(float(nest.capacity), 4.0),
            self._norm(float(nest.occupied), max(1.0, float(nest.capacity))),
            self._norm(float(nest.available_slots), max(1.0, float(nest.capacity))),
            self._norm(float(len(nest.queue)), float(max(1, self.config.num_drones))),
            self._norm(nest.charge_rate, 0.006),
            self._norm(nest.utilization_time, self.config.dt * self.config.max_steps * max(1, nest.capacity)),
            self._norm(float(nest.completed_charges), float(max(1, self.config.num_drones))),
        ]

    def _info(self) -> dict[str, Any]:
        active = sum(1 for d in self.drones if d.status is not DroneStatus.FAILED)
        occupied = sum(n.occupied for n in self.nests)
        capacity = sum(n.capacity for n in self.nests)
        return {
            "step": self.step_count,
            "time": self.time,
            "active_drones": active,
            "completed": int(self.metrics["completed"]),
            "failed": int(self.metrics["failed"]),
            "invalid_actions": int(self.metrics["invalid_actions"]),
            "nest_utilization": occupied / max(1, capacity),
            "total_reward": self.metrics["total_reward"],
            "total_wait_time": self.metrics["total_wait_time"],
            "total_distance": self.metrics["total_distance"],
        }

    def _needs_charge(self, drone: Drone) -> bool:
        return drone.battery_ratio <= self.config.low_battery_threshold

    def _battery_after_arrival(self, drone: Drone, nest: Nest) -> float:
        energy = self._energy_cost(drone, self._distance(drone, nest))
        return (drone.battery - energy) / max(drone.max_battery, 1e-6)

    def _energy_cost(self, drone: Drone, distance: float) -> float:
        return distance * drone.energy_per_meter

    def _hover_energy_cost(self, drone: Drone, seconds: float) -> float:
        cruise_energy_per_second = drone.speed * drone.energy_per_meter
        return cruise_energy_per_second * self.config.hover_energy_factor * seconds

    def _distance(self, drone: Drone, nest: Nest) -> float:
        return math.hypot(drone.x - nest.x, drone.y - nest.y)

    def _drone_by_id(self, drone_id: str) -> Optional[Drone]:
        return next((drone for drone in self.drones if drone.id == drone_id), None)

    def _nest_by_id(self, nest_id: Optional[str]) -> Optional[Nest]:
        if nest_id is None:
            return None
        return next((nest for nest in self.nests if nest.id == nest_id), None)

    @staticmethod
    def _norm(value: float, maximum: float) -> float:
        if maximum <= 0:
            return 0.0
        return max(0.0, min(1.0, value / maximum))


def rollout(env: DroneChargingEnv, policy: Any, steps: int) -> list[dict[str, Any]]:
    obs = env.reset()
    history = []
    for _ in range(steps):
        action = policy(obs)
        obs, reward, done, info = env.step(action)
        history.append({"reward": reward, "info": info})
        if done:
            break
    return history
