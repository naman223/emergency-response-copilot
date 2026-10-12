# Demo script draft — target 3 minutes 30 seconds

0:00–0:20: Explain the problem: fragmented voice reports require a human to assemble critical context. Identify the Sustainability & Social Impact theme.

0:20–0:45: Open the application (local for rehearsal; deployed once available), start a private judging session, and start a fictional sample conversation. State whether the run is live Gemini or a prepared local fixture. Do not describe fixture results as live inference.

0:45–1:25: Show the reviewed speech-to-text report or play the attached original audio. Answer the actual current clarification, including Unknown where appropriate. Point out the progress states, validated reply, service indicators and source quotes. Do not promise a fixed live question or reveal private model reasoning.

1:25–1:55: Correct the location in chat, open Review and decide, check the prefilled review and multiple service selections, then choose Approve & simulate dispatch. Show the simulated SMS confirmation, receipt and saved clarification history. A separate draft save is optional.

1:55–2:20: Show an ambiguous/benign sample and demonstrate clarification rather than assuming urgency or safety.

2:20–3:00: Show the implemented architecture and actual evaluation results. Gemini runs through Vertex AI; Firebase Hosting serves the frontend, Cloud Run runs the API, and Firestore/private Storage persist the incident and audio in the hosted demo. Local fixture rehearsal uses emulators. Pub/Sub and independent responder access are not currently implemented. Describe the simulation and next validation step.

3:00–3:30: State the current limits: human review and simulated notifications, further language/real-speaker validation, and independent responder access as future work.

Record only fictional reports and synthetic/public test locations. Verify the hosted demo is restored and working before recording. Keep the final video within the required three to four minutes.
