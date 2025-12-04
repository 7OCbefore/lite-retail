// 引入 Deno 的 HTTP 服务库
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 设置跨域头，允许你的前端访问
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. 处理浏览器的预检请求 (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. 获取前端传过来的条形码
    const { barcode } = await req.json()
    
    // 3. 从环境变量里获取密钥 (为了安全，不要硬编码在这里)
    // 稍后我们会用命令行设置这两个变量
    const APP_ID = Deno.env.get('ROLL_APP_ID')
    const APP_SECRET = Deno.env.get('ROLL_APP_SECRET')

    if (!barcode) throw new Error('没有条形码')

    // 4. 拼接 Roll API 的地址
    const url = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${APP_ID}&app_secret=${APP_SECRET}`
    
    console.log(`正在查询条码: ${barcode}`)

    // 5. 向 Roll API 发起请求
    const response = await fetch(url)
    const data = await response.json()

    // 6. 检查 Roll API 返回的结果 (code 1 表示成功)
    if (data.code !== 1) {
       console.log("未找到商品信息")
       return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 7. 查到了！整理数据
    const result = {
      found: true,
      name: data.data.goodsName,
      price: data.data.price,
      brand: data.data.brand,
      spec: data.data.standard
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})