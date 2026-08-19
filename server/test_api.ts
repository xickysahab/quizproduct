// Native fetch used (Node 18+)

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  try {
    console.log('--- TESTING BACKEND APIS ---');
    
    // 1. REGISTER
    console.log('1. Registering user...');
    const registerRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email: 'test@slido.com', password: 'password123' })
    });
    let registerData: any = await registerRes.json();
    let token = registerData.token;

    if (registerRes.status === 400 && registerData.message.includes('already exists')) {
      console.log('User exists, logging in instead...');
      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@slido.com', password: 'password123' })
      });
      const loginData: any = await loginRes.json();
      token = loginData.token;
    }

    if (!token) throw new Error('Auth failed. No token.');
    console.log('✅ Auth successful! Token received.');

    // 2. CREATE EVENT
    console.log('2. Creating Event...');
    const eventRes = await fetch(`${BASE_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ title: 'Test Quiz Event' })
    });
    const eventData: any = await eventRes.json();
    if (!eventRes.ok) throw new Error(JSON.stringify(eventData));
    const eventId = eventData.event.id;
    const roomCode = eventData.event.roomCode;
    console.log(`✅ Event created! ID: ${eventId}, Room Code: ${roomCode}`);

    // 3. ADD QUESTION
    console.log('3. Adding Question to Event...');
    const qRes = await fetch(`${BASE_URL}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ 
        eventId, 
        text: 'What is the capital of France?', 
        options: ['London', 'Berlin', 'Paris', 'Madrid'],
        correctOption: 2
      })
    });
    const qData: any = await qRes.json();
    if (!qRes.ok) throw new Error(JSON.stringify(qData));
    const questionId = qData.question.id;
    console.log(`✅ Question added! ID: ${questionId}`);

    // 4. JOIN PARTICIPANT
    console.log('4. Joining Participant...');
    const joinRes = await fetch(`${BASE_URL}/participants/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, name: 'Alice' })
    });
    const joinData: any = await joinRes.json();
    if (!joinRes.ok) throw new Error(JSON.stringify(joinData));
    const participantId = joinData.participant.id;
    console.log(`✅ Participant Joined! ID: ${participantId}`);

    // 5. SUBMIT RESPONSE
    console.log('5. Submitting Response...');
    const respRes = await fetch(`${BASE_URL}/participants/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId, questionId, selectedOption: 2 })
    });
    const respData: any = await respRes.json();
    if (!respRes.ok) throw new Error(JSON.stringify(respData));
    console.log(`✅ Response Submitted! Is Correct? ${respData.response.isCorrect}`);

    // 6. DELETE EVENT (CLEANUP)
    console.log('6. Cleaning up (Deleting event)...');
    const delRes = await fetch(`${BASE_URL}/events/${eventId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!delRes.ok) throw new Error('Delete failed');
    console.log('✅ Cleanup successful!');
    
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
  }
}

runTests();
