import { createContext,useContext } from 'react'
import type { AssistantSessionState } from './AssistantProvider'
export const AssistantContext=createContext<AssistantSessionState|null>(null)
export function useAssistant(){const value=useContext(AssistantContext);if(!value)throw new Error('AssistantProvider is required');return value}
