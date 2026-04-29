import torch
import torch.nn as nn
import torch.nn.functional as F

from layers import BipartiteGraphAttentionLayer


# 无人机-机槽二分图 GAT 主网络。
# 输入原始物理特征，输出带有机槽上下文的无人机特征，以及机槽高阶特征。
class DroneDockGAT(nn.Module):
    def __init__(self, nfeat_drone, nfeat_dock, nhid, dropout, alpha, nheads):
        super(DroneDockGAT, self).__init__()
        self.dropout = dropout

        # 无人机和机槽原始特征维度不同，先投影到统一隐藏维度 nhid。
        self.proj_drone = nn.Linear(nfeat_drone, nhid)
        self.proj_dock = nn.Linear(nfeat_dock, nhid)

        # 多头二分图注意力：每个头从一个角度学习无人机与机槽的关系。
        self.attentions = nn.ModuleList(
            [
                BipartiteGraphAttentionLayer(
                    nhid, nhid, dropout=dropout, alpha=alpha, concat=True
                )
                for _ in range(nheads)
            ]
        )

        # 多头拼接后维度是 nhid * nheads，这里融合回 nhid。
        self.feature_fusion = nn.Linear(nhid * nheads, nhid)

    def forward(self, raw_drone, raw_dock, adj):
        # 先把两类节点特征映射到同一隐空间。
        h_drone = F.elu(self.proj_drone(raw_drone))
        h_dock = F.elu(self.proj_dock(raw_dock))

        # 训练时加入 dropout，降低过拟合风险。
        h_drone = F.dropout(h_drone, self.dropout, training=self.training)
        h_dock = F.dropout(h_dock, self.dropout, training=self.training)

        # 每个注意力头都会输出一份无人机特征，随后在特征维度拼接。
        h_prime_drone = torch.cat(
            [att(h_drone, h_dock, adj) for att in self.attentions], dim=1
        )
        h_prime_drone = F.dropout(
            h_prime_drone, self.dropout, training=self.training
        )
        out_drone = self.feature_fusion(h_prime_drone)

        # Actor 后面还需要机槽特征做点积打分，所以同时返回 h_dock。
        return out_drone, h_dock
