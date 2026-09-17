/** public/assets/icons/icon_<name>.png (16px 원본)을 픽셀 그대로 확대해 보여준다. */
export function Icon({ name, size = 16, alt = '' }: { name: string; size?: number; alt?: string }) {
  return <img className="px" src={`/assets/icons/icon_${name}.png`} width={size} height={size} alt={alt} style={{ verticalAlign: 'middle', imageRendering: 'pixelated' }} />;
}
