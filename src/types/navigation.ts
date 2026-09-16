import type { ComponentType, SVGProps } from 'react'

export interface NavItem {
  readonly label: string
  readonly path: string
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>
}
