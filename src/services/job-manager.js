const { randomUUID } = require("crypto");

class JobManager {
  constructor() {
    this.jobs = new Map();
  }

  create(data = {}) {
    const id = randomUUID();

    const job = {
      id,
      type: data.type || "import",
      provider: data.provider || null,
      provider_series_id:
        data.provider_series_id
          ? String(data.provider_series_id)
          : null,

      status: "queued",

      total: 0,
      completed: 0,
      failed: 0,
      progress: 0,

      current_episode: null,

      result: null,
      errors: [],

      created_at:
        new Date().toISOString(),

      started_at: null,
      finished_at: null
    };

    this.jobs.set(id, job);

    return job;
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  getAll() {
    return Array.from(
      this.jobs.values()
    ).sort((a, b) => {
      return new Date(b.created_at) -
        new Date(a.created_at);
    });
  }

  start(id, total = 0) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.status = "running";
    job.total = Number(total) || 0;
    job.started_at =
      new Date().toISOString();

    this.calculateProgress(job);

    return job;
  }

  setTotal(id, total) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.total = Number(total) || 0;

    this.calculateProgress(job);

    return job;
  }

  setCurrentEpisode(
    id,
    episode
  ) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.current_episode =
      episode || null;

    return job;
  }

  episodeCompleted(id) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.completed += 1;

    this.calculateProgress(job);

    return job;
  }

  episodeFailed(
    id,
    errorData = {}
  ) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.failed += 1;

    job.errors.push({
      ...errorData,
      time:
        new Date().toISOString()
    });

    this.calculateProgress(job);

    return job;
  }

  complete(id, result = null) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.status =
      job.failed > 0
        ? "completed_with_errors"
        : "completed";

    job.result = result;

    job.current_episode = null;

    job.finished_at =
      new Date().toISOString();

    this.calculateProgress(job);

    if (job.total > 0) {
      job.progress = 100;
    }

    return job;
  }

  fail(id, error) {
    const job = this.get(id);

    if (!job) {
      return null;
    }

    job.status = "failed";

    job.current_episode = null;

    job.finished_at =
      new Date().toISOString();

    job.errors.push({
      message:
        error?.message ||
        String(error),

      time:
        new Date().toISOString()
    });

    return job;
  }

  calculateProgress(job) {
    if (!job.total) {
      job.progress = 0;
      return;
    }

    const processed =
      job.completed +
      job.failed;

    job.progress =
      Math.min(
        100,
        Math.round(
          (processed / job.total) *
          100
        )
      );
  }
}

module.exports =
  new JobManager();
