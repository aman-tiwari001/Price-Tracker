/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: '#191ad7', // dark blue
        // secondary: '#ffff00' // lemon yellow
        secondary: '#ffffff' // white
      }
    },
  },
  plugins: [],
}