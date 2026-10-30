
const baseUrl = 'http://localhost:4000/api/auth';

async function testAuth() {
  const unique = Date.now();

  const customer = {
    userId: `testuser${unique}`,
    fullName: 'TRA Test Customer',
    email: `test${unique}@example.com`,
    password: 'TestCustomer@123'
  };

  console.log('\n1. Testing customer registration...');

  const registerResponse = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customer)
  });

  const registerData = await registerResponse.json();
  console.log('Registration status:', registerResponse.status);
  console.log('Registration response:', registerData);

  if (!registerResponse.ok) {
    console.log('\nRegistration failed. Fix this before testing login.');
    return;
  }

  console.log('\n2. Testing customer login...');

  const loginResponse = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: customer.userId,
      password: customer.password
    })
  });

  const loginData = await loginResponse.json();

  console.log('Login status:', loginResponse.status);
  console.log('Login response:', {
    message: loginData.message,
    user: loginData.user,
    tokenReceived: Boolean(loginData.token)
  });

  if (loginResponse.ok && loginData.token) {
    console.log('\nSUCCESS: Registration and login are working.');
  } else {
    console.log('\nLogin failed. Check the response above.');
  }
}

testAuth().catch(error => {
  console.error('Test failed:', error.message);
});
