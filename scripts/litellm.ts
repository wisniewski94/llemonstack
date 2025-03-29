/**
 * This script is used to add models to LiteLLM.
 *
 * TODO: convert this script to use showAction, showError, etc. helper functions.
 * TODO: add error checking for env vars not being set correctly.
 *
 * It will add Ollama and OpenAI compatible models.
 * Ollama must be running on the host machine.
 * LOCAL_LLM_OPENAI_API_BASE_URL and LOCAL_LLM_OPENAI_HOST_PORT must be set in
 * .env file for OpenAI compatible models to be loaded.
 */
import { Config } from './lib/config.ts'

// const config = Config.getInstance()
// await config.initialize()

type LiteLLMModelList = Array<{
  id: string
  object?: string
  created?: number
  owned_by?: string
}>

interface LiteLLMModel {
  model_name: string
  litellm_params: {
    model: string
    custom_llm_provider: string
    api_base: string
    input_cost_per_token: number
    output_cost_per_token: number
  }
}

async function addOllamaModelsToLiteLLM(
  { models_url, api_base, litellm_api_base, litellm_api_key, models = [] }: {
    models_url: string
    api_base: string
    litellm_api_base: string
    litellm_api_key: string
    models: LiteLLMModelList
  },
) {
  try {
    console.log('Fetching models from Ollama...')

    // Fetch all available models from Ollama
    const ollamaResponse = await fetch(models_url)
    if (!ollamaResponse.ok) {
      throw new Error(`Failed to fetch Ollama models: ${ollamaResponse.statusText}`)
    }

    const ollamaData = await ollamaResponse.json()
    const ollamaModels = ollamaData.models || []

    console.log(`Found ${ollamaModels.length} models on Ollama server`)

    // LiteLLM has an issue with using custom_llm_provider:"ollama" from n8n.
    // It's better to use the OpenAI compatible API endpoints for ollama.
    // "litellm_params": {
    //   "custom_llm_provider": "openai", // instead of "ollama"
    //   "api_base": "http://host.docker.internal:11434/v1", // include /v1 in the url
    //   "input_cost_per_token": 0,
    //   "output_cost_per_token": 0,
    //   "use_in_pass_through": false,
    //   "merge_reasoning_content_in_choices": false,
    //   "model": "deepseek-r1:1.5b"
    // },

    // Add each model to LiteLLM
    for (const model of ollamaModels) {
      await addModelToLiteLLM({
        model_name: `ollama/${model.name}`, // This is how the model will appear in LiteLLM
        litellm_params: {
          model: model.name, // This is the model name from Ollama
          custom_llm_provider: 'openai', // instead of "ollama"
          api_base: `${api_base}/v1`, // include /v1 in the url for OpenAI compatible API
          input_cost_per_token: 0,
          output_cost_per_token: 0,
        },
      }, { models, litellm_api_base, litellm_api_key, force: false })
    }

    console.log('All Ollama models have been added to LiteLLM')
  } catch (error) {
    console.error('Error adding Ollama models to LiteLLM:', error)
  }
}

async function addOpenAICompatibleModelsToLiteLLM(
  { models_url, api_base, litellm_api_base, litellm_api_key, models = [] }: {
    models_url: string
    api_base: string
    litellm_api_base: string
    litellm_api_key: string
    models: LiteLLMModelList
  },
) {
  try {
    console.log(`Fetching models from OpenAI compatible provider: ${models_url}...`)

    // Fetch all available models from provider
    const modelsResponse = await fetch(models_url)
    if (!modelsResponse.ok) {
      throw new Error(`Failed to fetch models: ${modelsResponse.statusText}`)
    }

    const modelsData = await modelsResponse.json()
    const openAIModels = modelsData.data || []

    console.log(`Found ${openAIModels.length} models on OpenAI compatible provider`)

    // Add each model to LiteLLM
    for (const model of openAIModels) {
      const modelName = `locallm/${model.id}`
      await addModelToLiteLLM({
        model_name: modelName,
        litellm_params: {
          model: modelName,
          custom_llm_provider: 'openai',
          api_base,
          input_cost_per_token: 0,
          output_cost_per_token: 0,
        },
      }, { models, litellm_api_base, litellm_api_key, force: false })
    }

    console.log('All OpenAI compatible models have been added to LiteLLM')
  } catch (error) {
    console.error('Error adding OpenAI compatible models to LiteLLM:', error)
  }
}

async function getLiteLLMModels({ litellm_api_base, litellm_api_key }: {
  litellm_api_base: string
  litellm_api_key: string
}) {
  const response = await fetch(`${litellm_api_base}/models?return_wildcard_routes=false`, {
    headers: {
      'Authorization': `Bearer ${litellm_api_key}`,
    },
  })
  return (await response.json()).data || []
}

async function addModelToLiteLLM(
  model: LiteLLMModel,
  { litellm_api_base, litellm_api_key, models, force = false }: {
    litellm_api_base: string
    litellm_api_key: string
    models: LiteLLMModelList
    force?: boolean
  },
): Promise<LiteLLMModel> {
  // Check if the model already exists in LiteLLM before adding it
  if (models.find((m) => m.id === model.model_name)) {
    if (!force) {
      console.log(`Model ${model.model_name} already exists, skipping`)
      return model
    } else {
      console.log(
        `Model ${model.model_name} already exists, but force is true, so attempting to re-add the model...`,
      )
    }
  } else {
    console.log(`Model ${model.model_name} does not exist, adding...`)
  }

  // Add the model to LiteLLM
  const response = await fetch(`${litellm_api_base}/model/new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellm_api_key}`,
    },
    body: JSON.stringify(model),
  })

  if (!response.ok) {
    const errorText = await response.json()
    console.error(`Failed to add model ${model.model_name}: ${errorText}`)
    throw new Error(`Failed to add model ${model.model_name}: ${errorText}`)
  }

  const result = await response.json()
  console.log(`Successfully added model ${result.model_name}`)
  return result
}

export async function loadModels(config: Config) {
  // Load environment variables from .env file
  const env = config.env

  const LITELLM_API_BASE = env.LITELLM_API_BASE || 'http://localhost:3004'
  const LITELLM_API_KEY = env.LITELLM_API_KEY || env.LITELLM_MASTER_KEY
  const LOCAL_LLM_OPENAI_API_BASE_URL = env.LOCAL_LLM_OPENAI_API_BASE_URL
  const LOCAL_LLM_OPENAI_HOST_PORT = env.LOCAL_LLM_OPENAI_HOST_PORT || '1234' // default to LM Studio port

  const liteLLMModels = await getLiteLLMModels({
    litellm_api_base: LITELLM_API_BASE,
    litellm_api_key: LITELLM_API_KEY,
  })
  console.log('Existing LiteLLM models:', liteLLMModels)
  console.log(`Found ${liteLLMModels.length} models on LiteLLM`)

  await addOllamaModelsToLiteLLM({
    litellm_api_base: LITELLM_API_BASE,
    litellm_api_key: LITELLM_API_KEY,
    models_url: 'http://localhost:11434/api/tags', // Tags endpoint gives more data than /v1/models
    api_base: 'http://host.docker.internal:11434',
    models: liteLLMModels,
  })
  await addOpenAICompatibleModelsToLiteLLM({
    litellm_api_base: LITELLM_API_BASE,
    litellm_api_key: LITELLM_API_KEY,
    models_url: `http://localhost:${LOCAL_LLM_OPENAI_HOST_PORT}/v1/models`,
    api_base: LOCAL_LLM_OPENAI_API_BASE_URL,
    models: liteLLMModels,
  })
}
