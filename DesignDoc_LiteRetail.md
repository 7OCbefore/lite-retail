# **轻云零售 (LiteRetail) —— 小型零售店管理系统产品设计文档**

**版本号**: 1.0

**状态**: 规划中

**设计语言**: Google Material Design 3 (MD3)

## **1\. 产品概述 (Product Overview)**

### **1.1 背景与目标**

针对中国三线城市（如贵阳、绵阳）中典型的50-80平米家庭式烟酒杂货店，开发一款轻量级、低成本的单页Web应用程序（SPA）。旨在解决手工记账繁琐、库存不清、价格记忆混乱等痛点，通过最低限度的硬件投入（仅需一部智能手机或平板），实现店铺管理的数字化。

### **1.2 用户画像 (User Persona)**

* **店主**: 老张，52岁。  
* **特征**: 经营店铺10年，习惯用本子记账，但经常漏记。对智能手机操作基本熟练（会用微信、抖音），但视力稍弱，排斥复杂的电脑软件。  
* **核心诉求**: 字要大，操作要快（不想让顾客等），能扫码，最好能知道这包烟还没卖完之前需不需要进货。

### **1.3 核心价值**

* **极简操作**: 遵循 MD3 规范，强调视觉层级，降低学习成本。  
* **离线优先**: 应对店铺死角或临时断网，保证生意不中断。  
* **成本极低**: 纯Web架构，无专用硬件依赖，服务器资源消耗最小化。

## **2\. 详细功能规格 (Functional Specifications)**

### **2.1 核心模块：零售收银 (POS)**

* **场景**: 店主站在柜台，顾客拿来商品。  
* **操作流程**:  
  1. 点击主界面右下角巨大的 FAB (Floating Action Button) "开单"。  
  2. **输入模式 A (扫描)**: 点击“扫描”图标，唤起摄像头，对准条码，识别成功后“滴”声反馈，自动加入购物车。  
  3. **输入模式 B (搜索)**: 顶部搜索栏输入“软中华”，点击结果加入购物车。  
  4. **调整**: 在列表中点击“+”或“-”调整数量，支持手势侧滑删除条目。  
  5. **结算**: 底部显示总金额，点击“结算完成”按钮（仅记录，不做支付网关集成，默认视为现金/聚合码已收）。  
* **业务规则**:  
  * 库存不足时弹出 Snackbar 提示，但允许负库存销售（先卖后补录）。  
  * 自动计算：单价 \* 数量 \= 小计，Σ小计 \= 总额。

### **2.2 核心模块：入库登记 (Stock In)**

* **场景**: 供货商送货上门，或店主从批发市场回来。  
* **操作流程**:  
  1. 进入“库存管理” Tab，点击“入库”。  
  2. 填写/选择供应商（可选）。  
  3. 扫描商品条码或新建商品。  
  4. 输入进货数量和进货单价（自动记忆上次进货价）。  
  5. 提交入库单，库存实时增加。

### **2.3 核心模块：商品管理 (Product Mgmt)**

* **功能**:  
  * **新建商品**: 必填（条码、名称、零售价），选填（分类、进货价、库存预警）。  
  * **条码库**: 利用 EAN-13 码。若扫描新条码，系统应提示“未录入商品”并跳转至新建页面，自动填充条码字段。  
  * **价格管理**: 清晰展示进货价与零售价，计算毛利率供参考。

### **2.4 核心模块：库存查询与预警**

* **功能**:  
  * **列表视图**: 展示所有商品，支持按分类筛选（烟、酒、饮料）。  
  * **低库存高亮**: 库存低于阈值（如5件）的商品，卡片背景色变更为 MD3 定义的 Error Container 颜色。  
  * **流水记录**: 点击商品进入详情页，展示最近10条出入库时间线。

## **3\. 条形码扫描功能设计 (Barcode Scanning)**

鉴于Web端调用摄像头的限制与挑战，采用以下策略：

* **技术选型**: 集成 BarCodeDetector 库。  
* **UI 交互**:  
  * **取景器**: 在全屏模态窗口中显示摄像头画面，中间覆盖半透明遮罩，仅留出矩形扫描区（高亮边框）。  
  * **环境适应**: 如果浏览器支持 ImageCapture API，在界面提供“手电筒/补光”开关按钮。  
  * **反馈机制**:  
    * *视觉*: 扫描成功瞬间，矩形框闪烁绿色。  
    * *听觉*: 播放短促的“滴”声（需处理浏览器自动播放策略）。  
    * *触觉*: 手机震动（使用 navigator.vibrate(200)）。  
* **离线/弱网处理**:  
  * 条码库（Barcode \-\> ID 的映射）应缓存在 LocalStorage 或 IndexedDB 中。  
  * 断网状态下扫描，直接匹配本地数据库，无需请求服务器。

## **4\. 系统架构设计 (System Architecture)**

### **4.1 技术栈推荐**

* **前端**: Vue 3 (Vite构建)。  
* **UI 框架**: Material UI (MUI) 或 Vuetify (配置为 Material Design 3 模式)。  
* **本地存储**: RxDB 或 Dexie.js (IndexedDB wrapper) 实现离线数据持久化。  
* **后端**: Node.js (Koa/Express) 或 Python (FastAPI)。  
* **数据库**: MongoDB (适合商品这种灵活Schema) 或 PostgreSQL。

### **4.2 架构图 (Architecture Diagram)**

graph TD  
    User\[店主/手机浏览器\] \--\>|HTTPS| WebApp\[PWA 前端应用\]  
      
    subgraph "客户端 (浏览器)"  
        WebApp \--\>|UI渲染| Components\[MD3 组件库\]  
        WebApp \--\>|扫描流| Camera\[HTML5 Camera API\]  
        WebApp \--\>|数据读写| OfflineMgr\[离线管理器\]  
        OfflineMgr \--\>|缓存| IndexedDB\[(本地 IndexedDB)\]  
        OfflineMgr \--\>|同步逻辑| SyncWorker\[Service Worker\]  
    end  
      
    subgraph "云端/服务端"  
        SyncWorker \--\>|REST/GraphQL| APIGateway\[API 网关\]  
        APIGateway \--\>|鉴权| Auth\[认证服务\]  
        APIGateway \--\>|业务逻辑| Backend\[后端服务\]  
        Backend \--\>|读写| CloudDB\[(云数据库)\]  
    end

### **4.3 离线同步策略**

采用 **"Optimistic UI" (乐观UI)** 策略：

1. 用户操作（如销售结算）立即写入本地 IndexedDB，UI 立刻反馈“成功”。  
2. 后台将操作加入 SyncQueue（同步队列）。  
3. 网络恢复时，队列按顺序向服务器发送请求。  
4. 若服务器返回冲突（如库存不足），通过 Toast 通知用户修正。

## **5\. UI/UX 设计规范 (Material Design 3\)**

### **5.1 视觉风格 (Visual Identity)**

* **主题色**: 基于“活力与信任”。  
  * Primary: \#006C50 (深青色 \- 代表稳健、现金流)  
  * Secondary: \#4C6359 (灰绿色 \- 用于次要元素)  
  * Tertiary: \#3E6373 (蓝灰色 \- 用于图表)  
  * Error: \#BA1A1A (警示红 \- 用于低库存、删除操作)  
* **字体**: Noto Sans SC (思源黑体)，正文最小 16sp，标题 24sp+，保证中老年用户易读性。  
* **形状**: MD3 特征的大圆角。  
  * 卡片圆角: 12dp \- 16dp  
  * 按钮圆角: 全圆角 (Stadium shape)

### **5.2 核心页面布局**

#### **A. 首页 (仪表盘 & 快捷入口)**

* **顶部栏 (Top App Bar)**: 显示店名，右侧显示“网络状态图标”（在线/离线）。  
* **数据卡片**: 今日销售额（大字号）、今日订单数。  
* **功能网格**: 两个大卡片入口 —— “商品管理”、“库存盘点”。  
* **底部 FAB**: 巨大的 Extended FAB，带图标+文字 “+ 收银开单”，位于右下角悬浮。  
* **底部导航栏 (Navigation Bar)**: 首页 | 商品 | 报表 | 设置。

#### **B. 零售收银页**

* **布局**: 典型的“购物车”模式。  
* **顶部**: 搜索栏 \+ 扫描按钮（Icon Button）。  
* **主体**: 列表视图。每行一个商品，左侧商品名，右侧 数量控制器 (- 1 \+) 和 金额。  
* **底部片 (Bottom Sheet)**: 固定在底部。  
  * 左侧: "合计: ¥128.00"  
  * 右侧: 实心填充按钮 "确认收款"。

#### **C. 扫描界面 (Overlay)**

* 全屏黑色遮罩 (Opacity 80%)。  
* 中间透明取景框 (宽高比 16:9 或 1:1)。  
* 屏幕下方: "手电筒"开关，"取消"按钮。  
* 提示文案: "将条码放入框内，自动扫描"。

## **6\. 数据模型 (Data Model)**

### **6.1 实体关系图 (ER Diagram)**

erDiagram  
    PRODUCT ||--o{ STOCK\_LOG : "产生"  
    PRODUCT ||--o{ SALE\_ITEM : "包含"  
    SALE\_ORDER ||--|{ SALE\_ITEM : "组成"

    PRODUCT {  
        string id PK  
        string name "商品名称"  
        string barcode "EAN-13条码"  
        string category "分类"  
        decimal price\_cost "进货价"  
        decimal price\_retail "零售价"  
        int stock\_current "当前库存"  
        int stock\_min "预警阈值"  
        timestamp updated\_at  
    }

    SALE\_ORDER {  
        string id PK  
        timestamp created\_at  
        decimal total\_amount "订单总额"  
        string payment\_method "支付方式(标记)"  
        boolean is\_synced "同步状态"  
    }

    SALE\_ITEM {  
        string id PK  
        string order\_id FK  
        string product\_id FK  
        string product\_name "快照名称"  
        int quantity  
        decimal unit\_price "快照单价"  
        decimal subtotal  
    }

    STOCK\_LOG {  
        string id PK  
        string product\_id FK  
        string type "IN=入库, OUT=出库, ADJUST=盘点"  
        int quantity\_change "变化数量(+/-)"  
        timestamp created\_at  
    }

## **7\. API 接口设计 (API Design)**

所有接口基于 RESTful 风格，返回 JSON 格式。

### **7.1 商品接口**

* GET /api/v1/products: 获取商品列表（支持分页、搜索、分类过滤）。  
* GET /api/v1/products/{barcode}: 根据条码精确查找商品。  
* POST /api/v1/products: 创建新商品。  
* PUT /api/v1/products/{id}: 更新商品信息。

### **7.2 销售接口**

* POST /api/v1/sales: 提交销售单。  
  * **Payload**:  
    {  
      "items": \[  
        {"product\_id": "123", "quantity": 2, "price": 15.00},  
        {"product\_id": "456", "quantity": 1, "price": 5.00}  
      \],  
      "created\_at": "2023-10-27T10:00:00Z"  
    }

  * **Response**: 201 Created

### **7.3 同步接口 (Sync)**

* POST /api/v1/sync/batch: 批量上传离线数据。

## **8\. 非功能性需求 (Non-functional Requirements)**

1. **性能**:  
   * 首屏加载时间 (FCP) \< 1.5秒 (在4G网络下)。  
   * 扫描识别响应时间 \< 500ms。  
   * 离线数据库支持至少 5000 条商品数据，无卡顿。  
2. **安全性**:  
   * 全站 HTTPS 加密。  
   * 数据备份：每日凌晨自动备份云端数据库。  
3. **兼容性**:  
   * 支持 Android Chrome (v80+), iOS Safari (v13+)。  
   * 针对低端 Android 机型（2GB 内存）进行内存优化，避免页面崩溃。  
4. **成本控制**: 
   * 图片存储：初期不强制上传商品图片，使用内置分类图标（如香烟图标、酒瓶图标）代替，节省流量与存储费。