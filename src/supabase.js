import { createClient } from '@supabase/supabase-js'

// 替换 Supabase 项目信息
const supabaseUrl = 'https://wpnowjoxpdnqfvcbhavg.supabase.co'
const supabaseKey = 'sb_publishable_PLQGSvVQN5Wiq1Rjex59GA_Nl5QlZ3Q'

export const supabase = createClient(supabaseUrl, supabaseKey)