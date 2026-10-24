export function PrepSketch() {
  return (
    <svg viewBox="0 0 420 280" className="h-auto w-full" role="img" aria-label="Cross-section of a tapered crown preparation">
      <rect x="0" y="0" width="420" height="280" fill="#F4F0E8" />
      <path d="M28 214 H392" stroke="#C9BBA6" strokeWidth="1" />
      <text x="36" y="232" fill="#5C6570" fontSize="11" fontFamily="Manrope, sans-serif">
        Finish line
      </text>
      <path
        d="M78 214 L128 86 H292 L342 214"
        fill="#E7F0EA"
        stroke="#2C453C"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M128 86 H292"
        fill="none"
        stroke="#2C5FA8"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <path d="M150 48 H270" stroke="#2C5FA8" strokeWidth="1" />
      <path d="M150 44 V52 M270 44 V52" stroke="#2C5FA8" strokeWidth="1" />
      <text x="176" y="40" fill="#2C5FA8" fontSize="12" fontFamily="ui-monospace, monospace">
        1.5–2.0 mm
      </text>
      <path d="M128 118 L168 118" stroke="#1F7A4D" strokeWidth="1.4" />
      <path d="M292 118 L332 118" stroke="#1F7A4D" strokeWidth="1.4" />
      <path d="M168 118 L200 150 L232 118" fill="none" stroke="#1F7A4D" strokeWidth="1.2" />
      <text x="188" y="172" fill="#1F7A4D" fontSize="13" fontFamily="ui-monospace, monospace">
        12° TOC
      </text>
      <circle cx="78" cy="214" r="3.5" fill="#C4654A" />
      <circle cx="342" cy="214" r="3.5" fill="#C4654A" />
      <text x="250" y="250" fill="#5C6570" fontSize="11" fontFamily="Manrope, sans-serif">
        Axial walls narrow toward the occlusal
      </text>
    </svg>
  );
}
