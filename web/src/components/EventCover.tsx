import { useState } from 'react'
import { imageSrc } from '../api'
import { Icon, type IconName } from './Icon'

export function EventCover({ image, category }: { image?: string | null; category?: string | null }) {
  const [failed, setFailed] = useState<string>()
  const src = imageSrc(image)
  const kind = (category ?? '').toLowerCase()
  const icon: IconName = /conference|tech|education|workshop/.test(kind) ? 'grid'
    : /sport|fitness/.test(kind) ? 'calendar' : 'ticket'
  const tone = (Array.from(kind).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3) + 1
  return (
    <div className="card-cover" data-tone={tone} aria-hidden="true">
      <span className="cover-glyph"><Icon name={icon} size={116} /></span>
      {src && failed !== src && <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} />}
    </div>
  )
}
