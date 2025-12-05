// supabase/functions/fetch-product/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 1. 设置跨域头 (允许前端访问)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 2. 处理预检请求 (前端发起的OPTIONS试探)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 调试日志：看看请求方法是什么
    console.log(`[Request] Method: ${req.method}`);

    // 3. 安全地读取请求体
    const bodyText = await req.text();
    // 如果没有内容，直接报错，防止 JSON.parse 崩溃
    if (!bodyText) {
      throw new Error('请求体为空 (Body is empty)');
    }
    
    // 解析 JSON
    const { barcode } = JSON.parse(bodyText);

    // 4. 获取密钥
    const APP_ID = Deno.env.get('MX_APP_ID')
    const APP_SECRET = Deno.env.get('MX_APP_SECRET')

    if (!APP_ID || !APP_SECRET) {
      throw new Error('服务端未配置 MX_APP_ID 或 MX_APP_SECRET')
    }

    // 5. 调用第三方 API
    console.log(`正在查询条码: ${barcode}`)
    const apiUrl = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${APP_ID}&app_secret=${APP_SECRET}`
    
    const apiRes = await fetch(apiUrl)
    const data = await apiRes.json()

    // 6. 返回结果
    if (data.code === 1 && data.data) {
       return new Response(
        JSON.stringify({
          found: true,
          name: data.data.goodsName,
          price: data.data.price,
          spec: data.data.standard
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({ found: false, msg: data.msg || "未找到商品" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error("处理出错:", error.message);
    return new Response(
      JSON.stringify({ found: false, msg: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // 返回200让前端能收到错误信息，而不是直接红一片
      }
    )
  }
})