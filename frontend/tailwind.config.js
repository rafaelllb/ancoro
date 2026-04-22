/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Ancoro - extraída da logo
        // Azul marinho (texto "Ancoro" na logo)
        'ancoro-navy': {
          50: '#E8F4F8',
          100: '#D1E9F1',
          200: '#A3D3E3',
          300: '#75BDD5',
          400: '#4A9BBF',
          500: '#2D7A9E',
          600: '#1B5A7D',
          700: '#1B4A68',
          800: '#1B3A5F',  // Cor principal do texto da logo
          900: '#152D4A',
          950: '#0D1B2E',
        },
        // Verde-teal (elementos gráficos da âncora)
        'ancoro-teal': {
          50: '#E6F7F7',
          100: '#CCEFEF',
          200: '#99DFDF',
          300: '#66CFCF',
          400: '#3AABAB',
          500: '#2D9596',  // Cor principal da âncora
          600: '#257A7B',
          700: '#1D5F60',
          800: '#154445',
          900: '#0D2A2A',
          950: '#061515',
        },
      },
    },
  },
  plugins: [],
}
