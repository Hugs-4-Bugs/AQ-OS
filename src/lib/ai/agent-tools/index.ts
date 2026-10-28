// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Agent Tool Layer (Phase 26 v2 — barrel)
// ═══════════════════════════════════════════════════════════════════

export {
  type ToolDefinition,
  type ToolContext,
  type ToolResult,
  type ToolResultStatus,
  type ToolInputSchema,
  type ToolOutputSchema,
  type ToolCategory,
  type ToolInputField,
  ToolValidationError,
  ToolAuthorizationError,
  ToolNotFoundError,
  validateToolInput,
  generateToolInvocationId,
} from './types';

export { registerTool, listTools, getTool, invokeTool } from './registry';

// Side-effect imports — register all tools when this barrel is loaded.
// MUST be after the registry exports so registry.ts is fully initialized
// before any tool file is evaluated.
import './lead-tools';
import './workflow-tools';
import './message-tools';
import './profile-tools';
import './activity-tools';
import './email-tools';
import './business-email-tools';
