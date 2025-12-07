/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // iOS 风格色彩系统
        'ios-gray-100': '#F2F2F7', // App 背景
        'ios-white': '#FFFFFF',    // 卡片背景
        'ios-blue': '#007AFF',     // 主色调
        'ios-red': '#FF3B30',      // 删除/警告
        'ios-green': '#34C759',    // 成功
        'ios-gray-text': '#3C3C43', // 文本颜色
        'ios-gray-placeholder': 'rgba(60, 60, 67, 0.3)', // 占位符
        'ios-gray-divider': 'rgba(60, 60, 67, 0.36)', // 分隔线
        'ios-gray-label': 'rgba(60, 60, 67, 0.6)', // 次要文本
        
        // 保持原主色但调整亮度使其在白色上更清晰
        primary: '#006C50',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

