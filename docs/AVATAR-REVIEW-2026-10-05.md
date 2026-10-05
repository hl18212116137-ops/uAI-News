# 博主头像检查

侧栏曾直接加载 pbs.twimg.com 图片。在本机抽查的 10 张图片直连均超时，通过已有代理能获取图片；客户端网络失败与历史头像 URL 失效都会导致字母占位图。SourceAvatarImg 曾缓存失败后的备用图片，后续重新挂载也可能不重试。

已保存 31 张经过 JPEG 校验的真实头像到 public/avatars，data/source-avatars.json 记录来源 URL 与站内路径。匹配已保存 URL 或缺少资料时优先使用站内图片；数据库提供不同的新头像 URL 时保留新图，失败后可回退站内副本。临时失败不再写入模块缓存。Git 和 Docker 构建均包含清单及图片。

截图中的 AravSrinivas 可获取真实头像，已补充站内副本。Thom_Wolf、RodmanAi 的历史图片失效，已用账号资料接口提供的新图补充副本。

资料接口对 PaulineLuc、satabor、roamaneth 返回 HTTP 200，但 JSON status 为 error，msg 为 user not found。不能把 HTTP 200 视为头像查询成功，也不能据此猜测真实账号。Bubeck 的公开账号是 SebastienBubeck，已修正推荐池源码并保存真实头像；已经写入线上数据库的旧 handle 不会随源码修改自动更新，需要核对实际数据库后修正。PaulineLuc 和 roamaneth 仍待确认正确账号。

尚未取得线上网址，未验证线上数据库或部署状态。本机配置连接的数据库没有信息源，因此没有执行数据库资料回填。验证包含所有站内 JPEG 文件、头像地址选择，以及网络失败后重新挂载恢复真实图片；58 项测试、类型检查与生产构建通过。
