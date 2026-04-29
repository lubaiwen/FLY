DELETE FROM users;
INSERT INTO users (username, password, name, role, enterprise) VALUES
('admin', '$2a$10$92NbBBORHK01LEFP9TgyxeWj/HPRq6mJu.Pu3dtViXPk5enjgtgbG', '系统管理员', 'admin', NULL),
('operator', '$2a$10$92NbBBORHK01LEFP9TgyxeWj/HPRq6mJu.Pu3dtViXPk5enjgtgbG', '运维人员', 'operator', NULL),
('enterprise', '$2a$10$92NbBBORHK01LEFP9TgyxeWj/HPRq6mJu.Pu3dtViXPk5enjgtgbG', '企业用户', 'enterprise', '顺丰速运');
