<script setup>
import { useMediaDetails } from '../composables/useMediaDetails'
import MovieDetailSheet from './MovieDetailSheet.vue'
import TvShowDetailSheet from './TvShowDetailSheet.vue'
import SourceDetailSheet from './SourceDetailSheet.vue'

const { sourceDetailOpen, sourceDetailSourceKey, sourceDetailItem } = useMediaDetails()
</script>

<template>
  <MovieDetailSheet />
  <TvShowDetailSheet />
  <SourceDetailSheet
    v-if="sourceDetailOpen"
    v-model="sourceDetailOpen"
    :source-key="sourceDetailSourceKey"
    :external-id="sourceDetailItem?.externalId"
    :kind="sourceDetailItem?.kind"
    :initial-item="sourceDetailItem"
  />
</template>
