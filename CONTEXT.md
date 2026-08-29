# Cocurdex

Cocurdex coordinates multiple agent sessions while keeping their execution and required user intervention understandable.

## Language

**Session Runtime State**:
A provider-neutral description of what an agent session is currently doing, independent of whether the user must intervene.
_Avoid_: Status, agent status

**Session Attention State**:
A provider-neutral description of the user action or unread result associated with a session, independent of whether the agent is still running.
_Avoid_: Notification status, runtime status

**Session Primary State**:
The highest-priority signal obtained by combining a session's Runtime State and Attention State for cross-session triage.
_Avoid_: Display status

**Settled Session**:
A session whose latest result the user considers handled; settling never suppresses a new permission request, question, plan review, or failure.
_Avoid_: Read session, completed session

**Result Disposition**:
The user's explicit treatment of a session result: automatic timestamp-based handling, manually unread, or settled.
_Avoid_: Read flag, notification state

## Workflow Language

**Workflow Definition Revision**:
An immutable, versioned description of steps, transitions, permissions, and artifact contracts for one workflow shape.
_Avoid_: Mutable template, orchestration script

**Workflow Run**:
A durable execution created from one frozen Workflow Definition Revision and one frozen set of executor bindings.
_Avoid_: Orchestration session, agent group

**Step Run**:
The durable execution state of one logical workflow step; retries do not replace it.
_Avoid_: Task, agent run

**Agent Attempt**:
One provider session attempt to execute an agent-backed Step Run. A retry or provider switch creates a new Agent Attempt.
_Avoid_: Step, task

**Attempt Runtime Identity**:
The durable adapter, provider session, provider operation, and resume identifiers used to reconcile or resume one Agent Attempt without creating a duplicate.
_Avoid_: Transcript cursor, process ID

**Workflow Artifact**:
An immutable, schema-versioned result passed between Step Runs, with recorded provenance and content identity.
_Avoid_: Transcript, output message

**Gate Decision**:
The durable record of an actor approving or rejecting a workflow transition.
_Avoid_: Pause message, permission response

**Workflow Suspension**:
A durable reason and continuation checkpoint that explains why a Workflow Run cannot currently advance. Resolving a suspension is separate from recording the decision or external event that allows progress.
_Avoid_: Toast, pause message, temporary error

**Executor Binding**:
The frozen mapping from a workflow role to an agent, model, runtime options, and permission profile for one Workflow Run.
_Avoid_: Default provider, current agent selection
