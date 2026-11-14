# FL-NIDS: Federated Learning-Based Network Intrusion Detection with Robust Model Aggregation

Frontend-only B.Tech project (React + Vite + Tailwind CSS + Recharts). There is **no backend**:
the federated training engine (MLP, FedAvg, coordinate-wise median, label-flipping, client dropout)
runs in the browser inside a Web Worker, so every number on screen comes from real training.

## Run it

Requires Node.js 18+ (tested with Node 22).

```bash
npm install
npm run dev        # open the URL it prints (http://localhost:5173)
```

Production build: `npm run build && npm run preview`.
Engine sanity test without a browser: `node scripts/engine-test.mjs`.

## Demo script (about 3 minutes)

1. **Dashboard** -> *Quick start demo* (loads synthetic traffic, preprocesses it, creates 5 IID clients).
2. **Federated Learning** -> pick FedAvg or Median, press *Start federated training*; watch loss/accuracy per round.
3. **Clients** -> switch to *Non-IID*, *Re-create clients*, view the skewed class distribution.
4. **Attack Simulation** -> mark Client 1 and 2 malicious (label flipping), run *Vary number of malicious clients*.
5. **Model Comparison** -> *Run comparison* for Centralized vs Local Ensemble vs FedAvg vs Median.
6. **Evaluation** -> accuracy, macro precision/recall/F1, false-positive rate, confusion matrix, communication payload.

## Print / photocopy mode

For photocopies, Xerox and mono laser printers, switch on **Print mode** (toggle at the bottom of the sidebar).
It uses a white page, black text and well-separated grays. Charts get a second cue besides color:
dashed vs solid lines with different markers (circle, square, triangle, diamond) and hatched / dotted / solid bar fills.
The confusion matrix uses darkness for counts and a thick border for correct predictions.
Then press `Ctrl+P`, tick **Background graphics**, and print (the sidebar is hidden automatically).
The palette lives in `src/lib/palette.jsx` and the CSS overrides at the end of `src/index.css`.

## Where things are

| Paper concept | File |
|---|---|
| MLP (forward, backprop, SGD) | `src/ml/mlp.js` |
| LocalTrain, FedAvg, coordinate-wise median, dropout schedule, label flipping, clipping/noise | `src/ml/federated.js` |
| IID / non-IID (Dirichlet) partitioning | `src/ml/partition.js` |
| Missing values, one-hot encoding, normalisation | `src/ml/preprocess.js` |
| Accuracy, macro P/R/F1, FPR, confusion matrix | `src/ml/metrics.js` |
| Centralized and local-ensemble baselines | `src/ml/federated.js` (`runCentralized`, `runLocalEnsemble`) |
| Synthetic traffic generator | `src/ml/sampleData.js` |
| Background training (Web Worker) | `src/ml/worker.js`, `src/lib/engine.js` |
| Pages | `src/pages/*` |

## Notes for the viva

- **FedAvg**: `w = sum_k (n_k / N) w_k`. **Median**: `w[j] = median_k w_k[j]` per parameter.
- Test data is held out by the server; scalers/imputers are fitted on training data only.
- Centralized MLP uses clean pooled data (upper-bound benchmark). The local ensemble averages the softmax outputs of independently trained client models.
- Same seed => same data split, initial model and dropout schedule for every method, so comparisons are fair.
- Median is robust to a minority of label-flipping clients on IID data, but non-IID data makes honest client updates differ a lot, which can hurt the median. Run the Attack Simulation study to see this yourself.
- Update clipping and Gaussian noise (Federated Learning page, advanced) are implementation-level protections, not a differential-privacy guarantee (as stated in the paper).
- The paper reports no verified numeric results, so none are hardcoded here.
- Experiment history is stored in the browser's localStorage (last 25 runs).
- The default dataset is synthetic. To use CIC-IDS2017, upload a sampled CSV (a few thousand to ~60 MB) on the Dataset page and choose the label column.
