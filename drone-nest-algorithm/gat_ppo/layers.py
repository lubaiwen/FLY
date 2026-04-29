import torch
import torch.nn as nn
import torch.nn.functional as F


# 二分图交叉注意力层：无人机作为查询端，机槽作为被聚合的信息端。
# adj 的形状是 [num_drones, num_docks]，用于表示哪些无人机-机槽边是有效的。
class BipartiteGraphAttentionLayer(nn.Module):
    def __init__(self, in_features, out_features, dropout, alpha, concat=True):
        super(BipartiteGraphAttentionLayer, self).__init__()
        self.dropout = dropout
        self.in_features = in_features
        self.out_features = out_features
        self.alpha = alpha
        self.concat = concat

        # 注意力打分向量，前半部分看无人机特征，后半部分看机槽特征。
        self.a = nn.Parameter(torch.empty(size=(2 * out_features, 1)))
        nn.init.xavier_uniform_(self.a.data, gain=1.414)

        self.leakyrelu = nn.LeakyReLU(self.alpha)

    def forward(self, h_drone, h_dock, adj):
        # 拆分打分向量，分别计算无人机端和机槽端的基础分数。
        a_drone = self.a[: self.out_features, :]
        a_dock = self.a[self.out_features :, :]

        score_drone = torch.matmul(h_drone, a_drone)
        score_dock = torch.matmul(h_dock, a_dock)

        # 广播相加后得到 [num_drones, num_docks] 的边打分矩阵。
        e = self.leakyrelu(score_drone + score_dock.T)

        # 不可连接的边置为极小值，让 softmax 后概率接近 0。
        zero_vec = -9e15 * torch.ones_like(e)
        attention = torch.where(adj > 0, e, zero_vec)

        # 对每架无人机可连接的机槽做归一化。
        attention = F.softmax(attention, dim=1)
        attention = F.dropout(attention, self.dropout, training=self.training)

        # 用注意力权重聚合机槽特征，生成新的无人机表示。
        h_prime_drone = torch.matmul(attention, h_dock)

        if self.concat:
            return F.elu(h_prime_drone)
        return h_prime_drone

    def __repr__(self):
        return (
            self.__class__.__name__
            + " ("
            + str(self.in_features)
            + " -> "
            + str(self.out_features)
            + ")"
        )
