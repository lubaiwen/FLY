import numpy as np
from typing import List, Tuple, Dict, Optional, Set
from dataclasses import dataclass
import time

from models import Drone, Nest, MatchingResult


@dataclass
class MatchingPair:
    drone_id: str
    nest_id: str
    weight: float
    slot_index: int = 0


class KuhnMunkres:
    
    def __init__(self):
        self.INF = float('inf')
        self.eps = 1e-9
    
    def solve(
        self,
        weight_matrix: np.ndarray,
        timeout: float = 0.5,
    ) -> Tuple[List[Tuple[int, int]], float]:
        if weight_matrix.size == 0:
            return [], 0.0
        
        start_time = time.time()
        
        n_drones, n_nests = weight_matrix.shape
        
        max_weight = np.max(weight_matrix)
        cost_matrix = max_weight - weight_matrix
        
        if n_drones <= n_nests:
            result, total_cost = self._km_algorithm(cost_matrix, timeout - (time.time() - start_time))
            total_weight = n_drones * max_weight - total_cost
        else:
            cost_matrix_t = cost_matrix.T
            result_t, total_cost = self._km_algorithm(cost_matrix_t, timeout - (time.time() - start_time))
            result = [(j, i) for i, j in result_t]
            total_weight = n_nests * max_weight - total_cost
        
        return result, total_weight
    
    def _km_algorithm(
        self,
        cost_matrix: np.ndarray,
        timeout: float,
    ) -> Tuple[List[Tuple[int, int]], float]:
        n, m = cost_matrix.shape
        
        if n == 0 or m == 0:
            return [], 0.0
        
        u = np.zeros(n)
        v = np.zeros(m)
        p = np.full(m, -1, dtype=int)
        way = np.full(m, -1, dtype=int)
        
        start_time = time.time()
        
        for i in range(n):
            if time.time() - start_time > timeout:
                break
            
            p[0] = i
            j0 = 0
            minv = np.full(m, self.INF)
            used = np.full(m, False)
            
            while p[j0] != -1:
                if time.time() - start_time > timeout:
                    break
                
                used[j0] = True
                i0 = p[j0]
                delta = self.INF
                j1 = -1
                
                for j in range(m):
                    if not used[j]:
                        cur = cost_matrix[i0, j] - u[i0] - v[j]
                        if cur < minv[j]:
                            minv[j] = cur
                            way[j] = j0
                        if minv[j] < delta:
                            delta = minv[j]
                            j1 = j
                
                if j1 == -1:
                    break
                
                for j in range(m):
                    if used[j]:
                        u[p[j]] += delta
                        v[j] -= delta
                    else:
                        minv[j] -= delta
                
                j0 = j1
            
            while j0 != 0:
                j1 = way[j0]
                p[j0] = p[j1]
                j0 = j1
        
        result = []
        total_cost = 0.0
        
        for j in range(1, m):
            if p[j] != -1:
                i = p[j]
                result.append((i, j))
                total_cost += cost_matrix[i, j]
        
        return result, total_cost
    
    def solve_with_capacity(
        self,
        weight_matrix: np.ndarray,
        nest_capacities: List[int],
        timeout: float = 0.5,
    ) -> Tuple[List[Tuple[int, int, int]], float]:
        if weight_matrix.size == 0:
            return [], 0.0
        
        n_drones = weight_matrix.shape[0]
        n_nests = weight_matrix.shape[1]
        
        expanded_cols = []
        for j, cap in enumerate(nest_capacities):
            expanded_cols.extend([j] * cap)
        
        n_expanded = len(expanded_cols)
        
        if n_expanded == 0:
            return [], 0.0
        
        expanded_matrix = np.zeros((n_drones, n_expanded))
        for j_exp, j_orig in enumerate(expanded_cols):
            expanded_matrix[:, j_exp] = weight_matrix[:, j_orig]
        
        result, total_weight = self.solve(expanded_matrix, timeout)
        
        result_with_slots = []
        for i, j_exp in result:
            j_orig = expanded_cols[j_exp]
            slot_index = expanded_cols[:j_exp].count(j_orig)
            result_with_slots.append((i, j_orig, slot_index))
        
        return result_with_slots, total_weight


class GreedyMatcher:
    
    def solve(
        self,
        weight_matrix: np.ndarray,
        nest_capacities: List[int] = None,
    ) -> Tuple[List[Tuple[int, int, int]], float]:
        if weight_matrix.size == 0:
            return [], 0.0
        
        n_drones, n_nests = weight_matrix.shape
        
        if nest_capacities is None:
            nest_capacities = [1] * n_nests
        
        remaining_capacity = nest_capacities.copy()
        result = []
        total_weight = 0.0
        
        flat_weights = []
        for i in range(n_drones):
            for j in range(n_nests):
                flat_weights.append((weight_matrix[i, j], i, j))
        
        flat_weights.sort(reverse=True, key=lambda x: x[0])
        
        for weight, i, j in flat_weights:
            if remaining_capacity[j] > 0:
                slot_index = nest_capacities[j] - remaining_capacity[j]
                result.append((i, j, slot_index))
                remaining_capacity[j] -= 1
                total_weight += weight
        
        return result, total_weight


class MatchingEngine:
    
    def __init__(self):
        self.km_solver = KuhnMunkres()
        self.greedy_solver = GreedyMatcher()
    
    def match_drones_to_nests(
        self,
        drones: List[Drone],
        nests: List[Nest],
        weight_matrix: np.ndarray,
        algorithm: str = "km",
        timeout: float = 0.5,
    ) -> List[MatchingPair]:
        if not drones or not nests:
            return []
        
        nest_capacities = [nest.available_slots() for nest in nests]
        
        if algorithm == "km":
            result, total_weight = self.km_solver.solve_with_capacity(
                weight_matrix, nest_capacities, timeout
            )
        else:
            result, total_weight = self.greedy_solver.solve(
                weight_matrix, nest_capacities
            )
        
        matching_pairs = []
        for i, j, slot_idx in result:
            pair = MatchingPair(
                drone_id=drones[i].id,
                nest_id=nests[j].id,
                weight=weight_matrix[i, j],
                slot_index=slot_idx,
            )
            matching_pairs.append(pair)
        
        return matching_pairs
    
    def create_matching_results(
        self,
        matching_pairs: List[MatchingPair],
        drones: List[Drone],
        nests: List[Nest],
        travel_times: np.ndarray,
        energy_costs: np.ndarray,
    ) -> List[MatchingResult]:
        results = []
        
        drone_map = {d.id: (i, d) for i, d in enumerate(drones)}
        nest_map = {n.id: (j, n) for j, n in enumerate(nests)}
        
        for pair in matching_pairs:
            i, drone = drone_map.get(pair.drone_id, (0, None))
            j, nest = nest_map.get(pair.nest_id, (0, None))
            
            if drone and nest:
                result = MatchingResult(
                    drone_id=pair.drone_id,
                    nest_id=pair.nest_id,
                    advantage_value=pair.weight,
                    travel_time=travel_times[i, j] if i < travel_times.shape[0] and j < travel_times.shape[1] else 0,
                    energy_cost=energy_costs[i, j] if i < energy_costs.shape[0] and j < energy_costs.shape[1] else 0,
                )
                results.append(result)
        
        return results


def build_weight_matrix(
    drones: List[Drone],
    nests: List[Nest],
    advantage_values: np.ndarray,
) -> np.ndarray:
    n_drones = len(drones)
    n_nests = len(nests)
    
    weight_matrix = np.zeros((n_drones, n_nests))
    
    for i in range(n_drones):
        for j in range(n_nests):
            if nests[j].is_available():
                weight_matrix[i, j] = advantage_values[i, j]
            else:
                weight_matrix[i, j] = -1e9
    
    return weight_matrix
