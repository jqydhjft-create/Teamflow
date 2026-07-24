import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import '@/styles/main.css'

import { createBootstrap } from '@/bootstrap'

if (typeof document !== 'undefined') {
  createBootstrap().mount('#app')
}
