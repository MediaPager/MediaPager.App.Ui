import { ref } from 'vue'

const sourceDetailOpen = ref(false)
const sourceDetailSourceKey = ref(null)
const sourceDetailItem = ref(null)

export function useMediaDetails() {
  function openSourceDetails(sourceKey, item) {
    sourceDetailSourceKey.value = sourceKey
    sourceDetailItem.value = item
    sourceDetailOpen.value = true
  }

  function closeSourceDetails() {
    sourceDetailOpen.value = false
  }

  return {
    sourceDetailOpen,
    sourceDetailSourceKey,
    sourceDetailItem,
    openSourceDetails,
    closeSourceDetails,
  }
}
