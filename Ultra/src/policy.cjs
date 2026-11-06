(function (root) {
  const EFFORTS = ['low', 'medium', 'high', 'max'];
  function selection(level, available = true) {
    if (level === 'ultra' && available) return { mode: 'ultra', reasoningEffort: 'max', proactiveDelegation: true };
    const effort = level === 'ultra' ? 'max' : level;
    if (!EFFORTS.includes(effort)) throw new Error('Unsupported reasoning effort');
    return { mode: 'standard', reasoningEffort: effort, proactiveDelegation: false };
  }
  function childOptions(effort = 'max') {
    if (!EFFORTS.includes(effort)) throw new Error('Unsupported child effort');
    return { reasoningEffort: effort };
  }
  function delegationInstructions(level, available = true, agentTeams = false) {
    if (!selection(level, available).proactiveDelegation) return '';
    return [
      agentTeams
        ? 'Ultra mode: proactively delegate using DeepSeek native Agent Teams. For every new user task, you MUST call spawn_teammate to start at least one teammate before beginning substantive task execution. Agent Teams is required, not optional; do not substitute ordinary subagent tools or wait for the user to ask for a team.'
        : 'Ultra mode: proactively delegate. For every new user task, you MUST start at least one native subagent before beginning substantive task execution. Delegation is required, not optional; do not wait for the user to ask for subagents.',
      `Identify a bounded useful assignment immediately and call ${agentTeams ? 'spawn_teammate' : 'an available native subagent tool'}. If the task has no independent implementation branch, assign an independent check, evidence lookup, or second-perspective verification. A task being simple is not a reason to skip delegation.`,
      ...(agentTeams ? [
        'Use the native shared task board for delegated work: inspect team_task_list, create missing tasks with team_task_create, and use team_task_get and team_task_update with the current expected_revision to assign, claim and complete work. Record acceptance criteria, dependencies and non-overlapping write_scopes; only complete tasks after their results are verified.',
        'Use the actual member targets returned by spawn_teammate or list_agents. Coordinate with send_message. Before wait_agent, check list_agents; resume required inactive teammates with send_message first, then re-list after waiting. An inactive teammate is not proof of task completion. Collect and assess every required teammate result before the final answer.',
        'Follow the native Team Lead and teammate roles. Only the Lead creates teammates in this Team version; do not tell teammates to recursively call spawn_teammate. Use only parameters exposed by the native tool schemas; spawn_teammate inherits the model configuration and does not accept an invented effort parameter.',
      ] : []),
      'Prefer parallel research, independent module analysis, test or validation work, and a second-perspective review when relevant. Keep the critical path moving yourself while delegated work runs.',
      'Reassess opportunities to delegate as the task develops. Start useful branches as soon as they become clear, instead of waiting until the main work is already complete.',
      'Keep ownership of requirements, key decisions, integration and the final answer. Continue useful independent work while children run.',
      'Use max reasoning for yourself and every new child by default. You may explicitly choose a supported child effort for a simpler task.',
      'Give each child a clear task, relevant context, deliverable and non-overlapping write scope. Reuse existing children when appropriate.',
      `For continuation of the same task, reuse an existing ${agentTeams ? 'native teammate through list_agents and send_message' : 'native subagent'} when appropriate. Avoid overlapping edits and unnecessary additional agents, but do not omit the required initial delegation.`,
      'A more specific user instruction forbidding delegation takes precedence. If no permitted native delegation tool is available, or host capacity, depth, permissions, review or cancellation prevents the start, respect that restriction and accurately report that delegation did not start. Never claim a subagent was started without a successful native tool result.',
      'Collect and assess child results before reporting completion. Distinguish verified outcomes from proposals and failed attempts.',
    ].join('\n');
  }
  const api = { EFFORTS, selection, childOptions, delegationInstructions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UltraPolicy = api;
})(globalThis);
