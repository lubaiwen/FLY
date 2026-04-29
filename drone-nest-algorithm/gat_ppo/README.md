# GAT + PPO

This repository has been trimmed to the current GAT + PPO training path.

Kept modules:

- `main.py`: training entry point
- `a2c_ppo_acktr/algo/ppo.py`: PPO update logic
- `a2c_ppo_acktr/storage.py`: rollout storage
- `a2c_ppo_acktr/model.py`: PPO-compatible GAT policy
- `models.py`: drone-dock GAT network
- `layers.py`: bipartite graph attention layer
- `a2c_ppo_acktr/arguments.py`: training arguments
- `a2c_ppo_acktr/utils.py`: log cleanup and learning-rate schedule helpers
