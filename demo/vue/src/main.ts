import { createApp } from 'vue'
import { createOcrSelectPlugin } from 'img-text-selection/vue'
import 'img-text-selection/style.css'
import App from './App.vue'
import './style.css'

createApp(App)
    .use(createOcrSelectPlugin())
    .mount('#app')
