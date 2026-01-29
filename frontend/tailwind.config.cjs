/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["\"Space Grotesk\"", "ui-sans-serif", "system-ui"],
        display: ["\"Fraunces\"", "ui-serif", "Georgia"],
      },
      colors: {
        ink: "#131717",
        ash: "#4B5C5C",
        sand: "#F4F1E8",
        clay: "#D3C6B6",
        ember: "#C33B2B",
        moss: "#3C6E61",
        sky: "#9DD4E8",
        slate: "#1E2B2F",
      },
      boxShadow: {
        soft: "0 14px 40px rgba(19, 23, 23, 0.18)",
        card: "0 10px 28px rgba(19, 23, 23, 0.12)",
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 1px 1px, rgba(19, 23, 23, 0.04) 1px, transparent 0)",
        glow: "radial-gradient(circle at 20% 10%, rgba(157, 212, 232, 0.4), transparent 55%)",
      },
    },
  },
  plugins: [],
};
