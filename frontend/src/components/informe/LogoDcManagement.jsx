// Logo del estudio para la presentación, dibujado a partir de la portada de
// los informes que se arman a mano (triple rombo turquesa, "DC MANAGEMENT®" y
// "ESTUDIO - SINCE 2020"). Si hay un archivo oficial, se reemplaza este SVG.
export default function LogoDcManagement({ claro = true, className = '' }) {
  const texto = claro ? '#F2F2F2' : '#34435A'
  return (
    <svg className={className} viewBox="0 0 580 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DC Management">
      <g fill="none" stroke="#2E9AA3" strokeWidth="1.6">
        <rect x="27" y="17" width="82" height="82" transform="rotate(45 68 58)" />
        <rect x="27" y="29" width="82" height="82" transform="rotate(45 68 70)" />
        <rect x="27" y="41" width="82" height="82" transform="rotate(45 68 82)" />
      </g>
      {/* monograma "dc" de trazo fino */}
      <g fill="none" stroke={texto} strokeWidth="2.2" strokeLinecap="round">
        <path d="M62 60 C50 60 48 84 62 84 C70 84 73 76 73 70" />
        <path d="M73 50 L73 84" />
        <path d="M92 64 C86 58 77 60 77 72 C77 84 87 86 93 80" />
      </g>
      <text x="150" y="76" fill="#C8AE86" fontFamily="Montserrat, sans-serif" fontSize="30" fontWeight="400" letterSpacing="6">DC MANAGEMENT</text>
      <text x="500" y="60" fill="#C8AE86" fontFamily="Montserrat, sans-serif" fontSize="14">®</text>
      <text x="262" y="104" fill={texto} fontFamily="Montserrat, sans-serif" fontSize="12" fontWeight="500" letterSpacing="2.4">ESTUDIO - SINCE 2020</text>
    </svg>
  )
}
