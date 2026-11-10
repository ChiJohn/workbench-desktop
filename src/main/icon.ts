import { nativeImage, type NativeImage } from 'electron'
import { renderAppIcon, type AppIconTone } from '../core/appIcon'

/** 运行时绘制的图标。任务栏要传 bright，否则深色任务栏上会发闷 */
export function createAppIcon(size = 32, tone: AppIconTone = 'standard'): NativeImage {
  return nativeImage.createFromBitmap(renderAppIcon(size, tone), { width: size, height: size })
}
