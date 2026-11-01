# 抽奖功能 · 实现说明

> 独立抽奖：管理员上传奖品图片并编辑文字，用户按每天次数抽取。
> **不与错题、积分、订正数量挂钩**（早期的积分方案已废弃）。

---

## 一、功能范围

| 角色 | 能做什么 |
| :--- | :--- |
| 用户 | 查看奖品墙、抽奖、查看自己的中奖记录 |
| 管理员 | 开关抽奖、设置每人每天可抽次数、奖品的增删改（图片 + 文字 + 权重 + 库存）、查看全部中奖记录 |

入口：

- 用户端：`/lottery`（首页有「抽奖」按钮）
- 管理端：`/admin/lottery`（管理后台右上角有「抽奖设置」按钮）

---

## 二、数据模型

`prisma/schema.prisma` 新增两张表：

### Prize（奖品）

| 字段 | 说明 |
| :--- | :--- |
| `name` | 奖品名称（≤60 字） |
| `description` | 说明文字（≤300 字） |
| `imagePath` | 相对路径 `uploads/prizes/xxx.png`；为空则显示占位图标 |
| `weight` | 相对权重（1–1000），越大越容易抽中 |
| `stock` | 库存；`null` = 不限量，`0` = 已抽完 |
| `enabled` | 停用后不进入抽奖池 |
| `isBlank` | 「谢谢参与」占位项，`true` 时不出现在奖品墙 |
| `sortOrder` | 展示排序 |

### DrawRecord（抽奖记录）

| 字段 | 说明 |
| :--- | :--- |
| `userId` / `prizeId` | 关联用户与奖品 |
| `prizeName` / `prizeImagePath` | **抽中时的快照**，管理员之后改名换图不影响历史 |
| `createdAt` | 用于统计每日次数 |

索引：`(userId, createdAt)` 用于算当日次数；`(createdAt)` 用于管理端按时间列出。

---

## 三、接口

### 用户端（均需登录，未登录返回 401）

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/lottery/status` | 今日已抽/剩余次数、是否可抽及原因 |
| `GET` | `/api/lottery/wheel` | 转盘布局（**含**「谢谢参与」与权重，供画等比例扇区） |
| `GET` | `/api/lottery/prizes` | 奖品墙（不含 `isBlank`，不暴露 `weight`） |
| `POST` | `/api/lottery/draw` | 抽一次 |
| `GET` | `/api/lottery/records?limit=20` | 我的中奖记录（不含「谢谢参与」） |
| `GET` | `/api/lottery/prizes/[id]/image` | 奖品图片二进制 |

`POST /api/lottery/draw` 的错误码：

| HTTP | code | 含义 |
| :--- | :--- | :--- |
| 403 | `lottery_disabled` | 管理员关闭了抽奖 |
| 429 | `daily_limit_reached` | 今日次数用完 |
| 409 | `no_prizes` / `no_stock` | 没有可抽奖品 / 刚被抽完 |

### 管理端（需 `requireAdmin`，普通用户 403）

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/admin/prizes` | 全部奖品（含占位项、概率、已抽中数） |
| `POST` | `/api/admin/prizes` | 新建（可带 `imageDataUrl`） |
| `PATCH` | `/api/admin/prizes/[id]` | 编辑（换图/删图/改库存权重等） |
| `DELETE` | `/api/admin/prizes/[id]` | 删除；**有中奖记录时返回 409** |
| `GET` | `/api/admin/lottery/config` | 读取规则 |
| `PATCH` | `/api/admin/lottery/config` | 修改 `enabled` / `drawsPerDay` |
| `GET` | `/api/admin/lottery/records` | 全部中奖记录（含用户邮箱） |

---

## 四、UED 设计（大转盘）

### 4.1 核心矛盾：动画要"看起来是转出来的"，结果必须服务端决定

如果"先转再请求"，动画停在哪与服务端结果很容易对不上（穿帮）；
如果"前端自己随机"，则可作弊。

因此采用 **服务端权威 + 动画演出**：

```
点击 → POST /api/lottery/draw（拿到奖品）→ 计算落点 → 播放 4.2 秒旋转 → 弹结果
```

用户感知就是"转出来的"，但结果不可伪造。代价是依赖一次网络往返（本地/局域网通常 < 50ms）。

### 4.2 扇区必须按权重等比例

若权重不同却画成等分，就会出现"小格子经常中"的穿帮。

`GET /api/lottery/wheel` 返回参与抽奖的**全部**奖品（含 `isBlank`）与 `weight`，
前端按 `weight / totalWeight` 切分扇区。`isBlank` 的「谢谢参与」也必须画进转盘——
否则没中奖时指针会停在某个奖品上，看起来像 bug。

### 4.3 落点计算

扇区从正上方（-π/2）开始顺时针切分，指针固定在正上方。

设第 i 个扇区中心角为 `mid_i`（轮盘自身坐标系），当前累计旋转为 `R`，
则指针落点满足 `(mid_i + R) ≡ -π/2 (mod 2π)`。

实现（`src/app/lottery/page.tsx` 的 `computeDelta`）：

1. 计算目标角 `target = (-π/2 - mid_i) mod 2π`
2. 求最小正增量 `Δ = (target - R) mod 2π`
3. `Δ += 2π × 6`（额外 6 圈，保证有旋转过程）
4. 落点加随机抖动 `±30% 扇区角`，避免每次都停在正中间

累积旋转量保存在 `rotationRef`，每次在旧值上叠加，避免角度回绕跳变。

### 4.4 布局变化时角度归零

抽完之后可能有奖品售罄，转盘布局改变，扇区角度映射随之变化。
若保留原旋转角，指针会指向错误的扇区。

因此以 `items.map(id).join(',')` 作为 key，布局一变就把角度重置为 0（不带动画）。

### 4.5 径向文字的左半圆翻转

沿半径排布的文字，在左半圆会上下颠倒。
处理方式：扇区中点 `mid` 满足 `cos(mid) < 0` 时，额外旋转 180° 并改用左对齐，
让文字始终正向可读。

### 4.6 视觉与降级

- 转盘为页面视觉主体，中心是「抽一次」按钮（点击区域足够大，移动端好按）
- 外圈渐变金环 + 旋转时外发光；指针为独立 DOM 元素，不随转盘旋转
- 扇区过窄（< 12°）时不画文字，避免糊成一团
- 无奖品 / 功能关闭 / 次数用完：转盘仍显示（用户能看到有什么奖品），按钮禁用并给出原因
- 抽奖中按钮显示转圈，禁止重复点击
- 结果弹窗区分「恭喜中奖」与「谢谢参与」，未中奖时不重复显示奖品名

---

## 五、关键实现细节

### 5.1 加权随机

`src/lib/lottery.ts` 的 `weightedPick()`：按 `weight` 累加、掷 0–sum 的随机数落在哪一段。

概率 = `weight / 所有可抽奖品 weight 之和`。管理端会把概率换算成百分比显示，
避免管理员误以为 `1:1:1` 代表不同概率。

### 5.2 必须存在「谢谢参与」

否则所有奖品权重之和构成 100%，抽奖必然中奖，奖品会被抽空。
因此迁移里预置了一条 `isBlank = true` 的「谢谢参与」（默认 weight 30），
它不出现在奖品墙，只作为未中奖落点。管理员可调权重控制中奖率。

### 5.3 库存扣减用条件更新

```ts
const updated = await tx.prize.updateMany({
  where: { id: picked.id, stock: { gt: 0 } },
  data: { stock: { decrement: 1 } },
});
if (updated.count === 0) { /* 被并发抽走，重抽 */ }
```

不能「先查库存再扣」——并发下会超发。整个流程（复查次数 → 抽 → 扣库存 → 写记录）
在 `prisma.$transaction` 内完成。

### 5.4 图片不进数据库

现有错题图是 base64 存 DB，但奖品图会出现在列表页，反复读大字段代价高。
因此奖品图写入数据卷 `data/uploads/prizes/`，DB 只存相对路径。

安全校验在 `src/lib/prize-image.ts`：

- 只接受 png / jpeg / webp
- 解码后 ≤ 2MB
- **校验文件头魔数**，不能只信 data URL 声明的类型
- 文件名由服务端随机生成，不使用调用方提供的名字
- 读取接口对 `path.basename` 做白名单正则，防目录穿越

### 5.5 不存「余额」概念

抽奖次数不落库，每次由 `DrawRecord` 按当日计数推导：
`剩余 = drawsPerDay - 今日已抽数`。天然幂等，不存在计数漂移。

---

## 六、配置

规则存在 `config/app-config.json`，与 AI 配置同一文件：

```json
{
  "lottery": {
    "enabled": true,
    "drawsPerDay": 1
  }
}
```

- `drawsPerDay`：每人每天可抽次数，`0` 表示不限，上限 100
- 未配置时默认 `enabled: true`、`drawsPerDay: 1`

管理端改动会立即写回该文件（`updateAppConfig` 已对 `lottery` 做逐字段合并，
避免只传一个字段把另一个冲掉）。

---

## 七、数据库迁移

新增迁移：`prisma/migrations/20261027020000_add_lottery/migration.sql`

内容：建 `Prize` / `DrawRecord` 两表 + 3 个索引 + 一条「谢谢参与」种子。

**部署时注意**：`docker-entrypoint.sh` 在容器启动时执行
`prisma migrate deploy`，失败只打日志不中断（`|| echo`）。

因此部署后**必须验证一次**：

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://<nas>:3000/api/lottery/status
```

| 返回 | 含义 |
| :--- | :--- |
| `401` | 表已建好、路由正常（未登录被拒）✅ |
| `500` | 迁移没成功，`Prize`/`DrawRecord` 不存在 ❌ |

若为 500，手动补建（只建表，不清数据）：

```bash
# $APP_DIR 为部署目录（含 docker-compose.yml 的那一层）
ssh <host> "cd \$APP_DIR && docker compose exec -T wrong-notebook \
  node node_modules/prisma/build/index.js db execute \
  --url file:/app/data/dev.db \
  --file prisma/migrations/20261027020000_add_lottery/migration.sql"
```

---

## 八、已验证的行为

本地生产构建 + 真浏览器验证，共 36 项检查全部通过：

| 类别 | 覆盖点 |
| :--- | :--- |
| 鉴权 | 5 个用户端/管理端接口未登录均 401；普通用户访问管理端 403 |
| 权限 | 未登录取奖品图 401 |
| 奖品 CRUD | 创建、编辑、删除；有中奖记录时删除返回 409 |
| 图片安全 | 非图片内容（伪装成 png 的文本）被 400 拒绝 |
| 加权随机 | 概率之和 = 100%；高权重奖品被抽中；售罄奖品不再进入池 |
| 库存 | 抽中后 `stock` 1→0、`drawCount` +1；不限量保持 `null` |
| 每日次数 | 第 N+1 次返回 429；关闭开关后返回 403 |
| 记录 | 奖品名快照写入；用户记录过滤掉「谢谢参与」；管理端看得到全部 |
| 图片服务 | 200 + `image/png` + `immutable` 缓存头 |
| 界面 | `/lottery`、`/admin/lottery` 均正常渲染，无横向溢出 |

---

## 九、管理员上手步骤

1. 登录管理员账号 → 打开 `/admin` → 右上角「抽奖设置」
2. 「规则」里打开开关，设置每人每天次数
3. 「新增奖品」：选图片（PNG/JPEG/WebP，≤2MB）、填名称与说明、设权重与库存
4. 至少建 1 个真实奖品；「谢谢参与」权重可按需调整（越大越容易不中）
5. 用户打开 `/lottery` 即可抽奖；中奖记录在管理端可查

**库存建议**：实物奖品填具体数量；虚拟奖品（免做一次作业等）留空表示不限量。
