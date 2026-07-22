export enum TestStatus {
  Idle = 'idle',
  Running = 'running',
  Finished = 'finished'
}

export enum TimeMode {
  Timer = 'timer',
  Stopwatch = 'stopwatch'
}

export type TimerDuration = 15 | 30 | 60 | 120;

export enum SoundMode {
  None = 'none',
  Click = 'click',
  Mechanical = 'mechanical',
  Typewriter = 'typewriter'
}

export enum RuleMode {
  Continuous = 'continuous',
  Strict = 'strict'
}
