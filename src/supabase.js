import { createClient } from '@supabase/supabase-js'

// 替换 Supabase 项目信息
const supabaseUrl = 'https://wpnowjoxpdnqfvcbhavg.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwbm93am94cGRucWZ2Y2JoYXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3Njc0MjksImV4cCI6MjA4MDM0MzQyOX0.LsicG-VZEYTgtbVvO5aCNonMrWQO_IDn14f8DYVWbzw'

export const supabase = createClient(supabaseUrl, supabaseKey)