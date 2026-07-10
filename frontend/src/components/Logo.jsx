export default function Logo({ size = 42 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <rect x="10" y="4" width="16" height="16" rx="3" transform="rotate(45 18 12)" fill="#087C85" />
      <rect x="22" y="16" width="16" height="16" rx="3" transform="rotate(45 30 24)" fill="#0ea3ae" opacity=".85" />
      <text x="13" y="42" fontSize="15" fontWeight="700" fill="#CEAC81">DS</text>
    </svg>
  )
}
