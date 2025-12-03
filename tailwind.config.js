/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 我们定义 MD3 风格的主题色
        primary: '#006C50', 
        secondary: '#4C6359',
        surface: '#f5f5f5',
      }
    },
  },
  plugins: [],
}

