/**
 * Synthetic network-traffic generator, used when CIC-IDS2017 is not available.
 * (The paper allows synthetic data, uploaded CSV files and a CIC-IDS2017 subset.)
 *
 * 5 traffic classes with overlapping feature distributions (so accuracy is not trivially 100%),
 * a few missing values and two categorical columns to exercise the preprocessing steps.
 */
import { makeRng } from './rng.js';

export const SAMPLE_CLASSES = ['Benign', 'DoS', 'PortScan', 'BruteForce', 'Botnet'];
const CLASS_PROBS = [0.55, 0.15, 0.12, 0.1, 0.08];

// [log-mean, log-sigma] of a log-normal distribution per class: Benign, DoS, PortScan, BruteForce, Botnet
const PROFILES = {
  flow_duration: [[3.0, 1.3], [1.8, 1.0], [0.6, 0.8], [2.6, 0.9], [3.4, 0.8]],
  fwd_packets: [[2.3, 0.9], [4.3, 0.7], [0.8, 0.5], [2.5, 0.6], [2.0, 0.6]],
  bwd_packets: [[2.2, 0.9], [0.6, 0.8], [0.3, 0.5], [2.4, 0.6], [1.8, 0.6]],
  fwd_bytes: [[6.5, 1.3], [7.8, 0.9], [4.2, 0.6], [6.0, 0.7], [5.6, 0.8]],
  bwd_bytes: [[7.0, 1.4], [4.0, 1.2], [3.5, 0.8], [6.2, 0.8], [5.4, 0.9]],
  flow_rate: [[2.0, 1.2], [5.0, 1.0], [4.6, 0.9], [2.9, 0.8], [1.7, 0.8]],
  syn_flag_count: [[0.2, 0.5], [1.9, 0.6], [1.6, 0.5], [0.9, 0.5], [0.3, 0.5]],
  ack_flag_count: [[1.8, 0.8], [0.3, 0.6], [0.2, 0.4], [1.6, 0.6], [1.5, 0.6]],
  unique_dst_ports: [[0.7, 0.8], [0.5, 0.6], [4.8, 0.7], [0.4, 0.4], [0.9, 0.6]],
  failed_logins: [[-1.0, 0.6], [-1.2, 0.5], [-1.0, 0.5], [2.2, 0.8], [-0.8, 0.6]],
  iat_mean: [[2.5, 1.1], [-1.0, 1.0], [-0.5, 0.9], [1.4, 0.8], [3.8, 0.7]],
  active_connections: [[1.5, 0.9], [4.0, 0.8], [3.2, 0.8], [2.0, 0.7], [1.9, 0.7]],
};
const PROTOCOLS = ['TCP', 'UDP', 'ICMP'];
const PROTOCOL_PROBS = [[0.65, 0.3, 0.05], [0.5, 0.2, 0.3], [0.9, 0.07, 0.03], [0.98, 0.01, 0.01], [0.7, 0.25, 0.05]];
const SERVICES = ['http', 'https', 'dns', 'ssh', 'ftp', 'other'];
const SERVICE_PROBS = [
  [0.3, 0.3, 0.2, 0.05, 0.05, 0.1], [0.45, 0.3, 0.1, 0.02, 0.02, 0.11], [0.15, 0.15, 0.1, 0.15, 0.15, 0.3],
  [0.02, 0.02, 0.01, 0.55, 0.35, 0.05], [0.2, 0.3, 0.25, 0.03, 0.02, 0.2],
];

export function generateSampleTable(nSamples = 6000, seed = 42, missingRate = 0.02, overlap = 0.06) {
  const rng = makeRng(seed);
  const labels = new Int32Array(nSamples);
  const profile = new Int32Array(nSamples);
  for (let i = 0; i < nSamples; i++) {
    labels[i] = rng.choice(CLASS_PROBS);
    // some rows are drawn from another class's profile -> overlap between benign and attack traffic
    profile[i] = rng.next() < overlap ? rng.int(SAMPLE_CLASSES.length) : labels[i];
  }
  const columns = [];
  for (const [name, params] of Object.entries(PROFILES)) {
    const values = new Float64Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      const [mu, sigma] = params[profile[i]];
      values[i] = Math.round(Math.exp(mu + sigma * rng.normal()) * 1000) / 1000;
    }
    columns.push({ name, type: 'numeric', values });
  }
  columns.push({ name: 'protocol', type: 'categorical', values: Array.from(profile, (p) => PROTOCOLS[rng.choice(PROTOCOL_PROBS[p])]) });
  columns.push({ name: 'service', type: 'categorical', values: Array.from(profile, (p) => SERVICES[rng.choice(SERVICE_PROBS[p])]) });
  columns.push({ name: 'label', type: 'categorical', values: Array.from(labels, (l) => SAMPLE_CLASSES[l]) });

  // inject missing values (to demonstrate imputation)
  for (const name of ['flow_duration', 'fwd_bytes', 'iat_mean', 'service']) {
    const col = columns.find((c) => c.name === name);
    for (let i = 0; i < nSamples; i++) {
      if (rng.next() < missingRate) col.values[i] = col.type === 'numeric' ? NaN : null;
    }
  }
  return { nRows: nSamples, columns };
}
