import fp from 'fastify-plugin'
import { BigQuery } from '@google-cloud/bigquery'

export default fp(async (fastify) => {
  const bq = new BigQuery({ projectId: process.env.BQ_PROJECT })
  const DATASET = process.env.BQ_DATASET || 'dcsmart_analytics'
  // Réplica en vivo de gestión (Datastream, CDC): de acá leen las vistas vw_*.
  const DATASET_CDC = process.env.BQ_DATASET_CDC || 'dcsmart_analytics_cdc'
  fastify.decorate('bq', bq)
  fastify.decorate('bqDataset', DATASET)
  fastify.decorate('bqDatasetCdc', DATASET_CDC)
})
