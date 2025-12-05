// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

console.log("Hello from Functions!")

Deno.serve(async (req) => {
  const { name } = await req.json()
  const data = {
    message: `Hello ${name}!`,
  }

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/fetch-product' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
// supabase/functions/fetch-product/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 1. 设置跨域头，允许你的前端（任何域名）访问
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 2. 处理浏览器的“预检”请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. 解析前端传来的数据
    const { barcode } = await req.json()
    if (!barcode) {
      throw new Error('未接收到条形码')
    }

    // 4. 获取环境变量（安全密钥）
    const APP_ID = Deno.env.get('MX_APP_ID')
    const APP_SECRET = Deno.env.get('MX_APP_SECRET')

    if (!APP_ID || !APP_SECRET) {
      throw new Error('服务端未配置 API 密钥')
    }

    // 5. 调用第三方接口 (MXNZP)
    console.log(`正在查询条码: ${barcode}`)
    const apiUrl = `https://www.mxnzp.com/api/barcode/goods/details?barcode=${barcode}&app_id=${APP_ID}&app_secret=${APP_SECRET}`

    const apiRes = await fetch(apiUrl)
    const data = await apiRes.json()

    console.log('第三方返回:', JSON.stringify(data))

    // 6. 统一返回格式给前端
    // 如果第三方 code === 1 代表成功
    if (data.code === 1 && data.data) {
       return new Response(
        JSON.stringify({
          found: true,
          name: data.data.goodsName,
          price: data.data.price,
          spec: data.data.standard,
          msg: "查询成功"
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // 没查到
      return new Response(
        JSON.stringify({ found: false, msg: data.msg || "未找到商品" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    // 7. 错误处理
    return new Response(
      JSON.stringify({ found: false, msg: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})