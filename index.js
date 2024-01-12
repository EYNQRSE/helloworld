//configure const
const express = require('express');
const app = express();
const port = process.env.PORT || 3002;
app.use(express.json());
const jwt = require('jsonwebtoken');
const cors = require('cors'); // Import the cors middleware
const timestamp = Date.now();
const date = new Date(timestamp);
const bcrypt = require('bcrypt');

console.log(date.toLocaleString()); // Display the date and time in the local format

const timestampInSeconds = Math.floor(Date.now() / 1000);
console.log(timestampInSeconds);

const TimeOptions = { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  };
  
  const formattedDate = date.toLocaleString('en-US', TimeOptions);
  
  console.log(formattedDate);

// Use cors middleware
app.use(cors());

//connect to swagger
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const SwaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cybercafe Management System API',
      description: 'API for managing visitors in a cybercafe',
      version: '1.0.0',
    },
  },
  apis: ['./swagger.js'], // files containing annotations as above
};
const swaggerSpec = swaggerJsdoc(SwaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//connect to mongo
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://B022120016:hUF1LQVnNZ5d2QpI@group12.7c7yswx.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

client.connect().then(res => {
  console.log(res);
});

app.post('/logout', (req, res) => {
  // Perform logout operations if needed
  // ...

  // Clear the token on the client side

  res.send('Logged out successfully');
});

//front page
app.get('/', (req, res) => {
  res.send('welcome to YOMOM');
});

function verifyTokenAndRole(role) {
    return (req, res, next) => {
        let header = req.headers.authorization;

        if (!header) {
            return res.status(401).send('Unauthorized');
        }

        let token = header.split(' ')[1];

        try {
            let decoded = jwt.verify(token, 'password');
            req.user = decoded;

            // Ensure role is present in the token
            if (!req.user.role) {
                console.error('Role not found in the token.');
                return res.status(401).send('Unauthorized');
            }

            // Ensure the user has the required role
            if (req.user.role === role) {
                next();
            } else {
                res.status(403).send(`Forbidden: ${role} access required`);
            }
        } catch (err) {
            console.error('JWT Verification Error:', err);
            res.status(401).send('Unauthorized');
        }
    };
}

async function createAdmin(username, password) {
    try {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        const adminData = {
            username: username,
            password: hashedPassword,
            role: 'admin',
        };

        const result = await client.db('cybercafe').collection('admin').insertOne(adminData);

        console.log('New admin account created:', result.ops[0]);
        return "Admin account has been created successfully.";
    } catch (error) {
        console.error(error);
        return "Failed to create admin account. Please try again later.";
    }
}

app.post('/login/admin', (req, res) => {
    login(req.body.username, req.body.password)
        .then(result => {
            if (result.message === 'Access Granted') {
                const token = generateToken({
                    username: req.body.username,
                    role: 'admin'
                });
                console.log('Generated Token:', token);
                res.send({ message: 'Successful login', token });
            } else {
                res.send('Login unsuccessful');
            }
        })
        .catch(error => {
            console.error(error);
            res.status(500).send("Internal Server Error");
        });
});

async function login(reqUsername, reqPassword) {
    try {
        const admin = await client.db('cybercafe').collection('admin').findOne({ username: reqUsername });

        if (!admin) {
            return { success: false, message: 'Admin not found!' };
        }

        // TODO: Use bcrypt to securely compare hashed passwords
        const isPasswordCorrect = await bcrypt.compare(reqPassword, admin.password);

        if (isPasswordCorrect) {
            return { success: true, message: 'Access Granted', user: admin };
        } else {
            return { success: false, message: 'Invalid password' };
        }
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Internal Server Error' };
    }
}

//update computer (admin)
app.put('/update/computer/:computername', verifyTokenAndRole('admin'), async (req, res) => {
    console.log('/update/computer/:computername: req.user', req.user); 
    const computername = req.params.computername;
    const { systemworking, available } = req.body;

    try {
        const updatecomputerResult = await client
            .db('configure')
            .collection('computer')
            .updateOne({ computername },
                { $set: { systemworking, available } });

        if (updatecomputerResult.modifiedCount === 0) {
            return res.status(404).send('computer not found or unauthorized');
        }

        res.send('computer updated successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Admin create member
app.post('/create/member', verifyTokenAndRole('admin'), async (req, res) => {
    console.log('/create/member: req.body', req.body);

    let result = await createMember(
        req.body.memberName,
        req.body.idproof,
        req.body.password,
        req.body.phoneNumber
    );
    res.send(result);
});

async function createMember(reqmemberName, reqidproof, reqpassword, reqphone) {
    try {
        // Check if the password is strong
        if (!isPasswordStrong(reqpassword)) {
            return "Password does not meet the strength criteria.";
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(reqpassword, 10);

        const result = await client.db('cybercafe').collection('customer').insertOne({
            "memberName": reqmemberName,
            "idproof": reqidproof,
            "password": hashedPassword,
            "phoneNumber": reqphone,
            "role": "member",
            "suspended": false,
            "visitors": []
        });

        console.log('MongoDB Insert Result:', result);

        return "Member account has been created. Welcome YOMOM member!!:D";
    } catch (error) {
        console.error(error);
        return "Failed to create member account. Please try again later.";
    }
}

app.put('/retrieve/pass/:visitorname/:idproof', verifyTokenAndRole('admin'), async (req, res) => {
    console.log('/retrieve/pass/:visitorname/:idproof: req.user', req.user);
    const visitorname = req.params.visitorname;
    const idproof = req.params.idproof;

    // Assuming cabinno and computername are defined elsewhere in your code or passed as parameters
    const cabinno = req.body.cabinno; // replace with actual value
    const computername = req.body.computername; // replace with actual value

    try {
        const updateaccessResult = await client
            .db('cybercafe')
            .collection('customer')
            .updateOne(
                { "visitors.visitorname": visitorname, "idproof": idproof },
                { $set: { "visitors.$.entrytime": formattedDate, "visitors.$.cabinno": cabinno, "visitors.$.computername": computername } }
            );

        if (updateaccessResult.modifiedCount === 0) {
            return res.status(404).send('Visitor not found or unauthorized');
        }

        res.send('Access updated successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

//admin view member
app.get('/get/member', verifyTokenAndRole('admin'), async (req, res) => {
    try {
        if (req.user.role === 'admin') {
            const allMembers = await getAllMembers();
            res.send(allMembers);
        } else {
            res.status(403).send('Forbidden: Admin access required');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function getAllMembers() {
    try {
        const result = await client
            .db('cybercafe')
            .collection('customer')
            .find({}, { _id: 0, memberName: 1, })
            .toArray();

        return result;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Admin view member phone number
app.get('/get/member/phone/:idproof', verifyTokenAndRole('admin'), async (req, res) => {
    const idproof = req.params.idproof;
    try {
        if (req.user.role === 'admin') {
            const memberPhoneNumber = await getMembersPhoneNumber(idproof);
            if (memberPhoneNumber) {
                res.json(memberPhoneNumber);
            } else {
                res.status(404).send('Member not found');
            }
        } else {
            res.status(403).send('Forbidden: Admin access required');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function getMembersPhoneNumber(idproof) {
    try {
        const result = await client
            .db('cybercafe')
            .collection('customer')
            .findOne({ idproof: idproof });

        if (result) {
            return {
                memberName: result.memberName,
                phoneNumber: result.phoneNumber,
            };
        } else {
            return null;
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Admin update member suspension status
app.put('/update/suspend/:memberName', verifyTokenAndRole('admin'), async (req, res) => {
    const memberNameToUpdate = req.params.memberName;
    const { suspended } = req.body;

    try {
        const updateMemberResult = await updateMember(memberNameToUpdate, suspended);

        if (updateMemberResult.matchedCount === 0) {
            return res.status(404).send('Member not found or unauthorized');
        }

        res.send('Member account updated successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function updateMember(memberName, suspend) {
    try {
        const result = await client
            .db('cybercafe')
            .collection('customer')
            .updateOne(
                { memberName },
                { $set: { suspended: suspend } }
            );

        return result;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Member login
app.post('/login/member', async (req, res) => {
    try {
        const result = await memberLogin(req.body.idproof, req.body.password);
        
        if (result.message === 'Correct password') {
            if (result.user.suspended) {
                return res.status(403).send('Account is suspended. Contact admin for assistance.');
            }
            const token = generateToken({ idproof: req.body.idproof, role: 'member', memberName: result.user.memberName });
            res.send({ message: 'Successful login. Welcome to YOMOM CYBERCAFE', token });
        } else {
            res.send('Login unsuccessful');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function memberLogin(idproof, password) {
    try {
        console.log('Entering memberLogin function');
        const user = await client.db('cybercafe').collection('customer').findOne({ idproof: idproof });

        if (!user) {
            return { success: false, message: 'User not found!' };
        }

        if (user.suspended) {
            return { success: false, message: 'Account is suspended', user };
        }

        // Use bcrypt to securely compare hashed passwords
        console.log('Before bcrypt.compare');
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        console.log('After bcrypt.compare');

        if (isPasswordCorrect) {
            const token = generateToken({ idproof, role: 'member', memberName: user.memberName });
            return { success: true, message: 'Correct password', token };
        } else {
            return { success: false, message: 'Invalid password' };
        }
    } catch (error) {
        console.error('Error in memberLogin:', error);
        return { success: false, message: 'Internal Server Error' };
    }
}


// Member create visitor
app.post('/create/visitor', verifyTokenAndRole('member'), async (req, res) => {
    try {
        console.log(req.user)
        const membername = req.user.memberName;

        // Call the modified createVisitor function
        let result = await createVisitor(
            membername,
            req.body.visitorname,
            req.body.idproof
        );

        // Check the result and send an appropriate response
        if (result.startsWith("Visitor account has been created")) {
            res.send(result);
        } else {
            // Handle the case where the member has reached the maximum limit
            res.status(400).send(result);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function createVisitor(memberName, visitorName) {
    try {
        const visitorData = {
            visitorname: visitorName,
            entrytime: 0,
            cabinno: 0,
            computername: "",
        };

        await client.db('cybercafe').collection('customer').updateOne(
            { memberName },
            { $push: { visitors: visitorData } }
        );

        return "Visitor account has been created. Welcome to YOMOM Cybercafe! :D";
    } catch (error) {
        console.error(error);
        return "Failed to create visitor account. Please try again later.";
    }
}

// View visitors
app.get('/get/my-visitors', verifyTokenAndRole, async (req, res) => {
    try {
        const memberName = req.user.memberName;

        if (req.user.role === 'admin') {
            const allVisitors = await getAllVisitors();
            res.send({ role: 'admin', visitors: allVisitors });
        } else {
            const visitors = await getVisitorsCreatedByMember(memberName);
            res.send({ role: 'member', visitors: visitors });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function getVisitorsCreatedByMember(memberName) {
    try {
        const cursor = client
            .db('cybercafe')
            .collection('customer')
            .find({ memberName }, { _id: 0, visitors: 1 });

        // Limit the number of results per query (you can adjust this number)
        const result = await cursor.limit(100).toArray();

        return result.map(({ visitors }) => visitors).filter(Boolean);
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function getAllVisitors() {
    try {
        const cursor = client
            .db('cybercafe')
            .collection('customer')
            .find({}, { _id: 0, visitors: 1 });

        // Limit the number of results per query (you can adjust this number)
        const result = await cursor.limit(100).toArray();

        return result.map(({ visitors }) => visitors).filter(Boolean);
    } catch (error) {
        console.error(error);
        throw error;
    }
}


// test create member
app.post('/test/create/member', async (req, res) => {

    let result = await testcreateMember(
        req.body.memberName,
        req.body.idproof,
        req.body.password,
        req.body.phoneNumber
    );
    res.send(result);
});

async function testcreateMember(reqmemberName, reqidproof, reqpassword, reqphone) {
    try {
        // Check if the password is strong
        if (!isPasswordStrong(reqpassword)) {
            return "Password is too weak.";
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(reqpassword, 10);

        const result = await client.db('cybercafe').collection('customer').insertOne({
            "memberName": reqmemberName,
            "idproof": reqidproof,
            "password": hashedPassword,
            "phoneNumber": reqphone,
            "role": "test-member",
            "suspended": false,
            "visitors": []
        });

        console.log('MongoDB Insert Result:', result);

        return "Test-Member account has been created. Welcome YOMOM member!!:D";
    } catch (error) {
        console.error(error);
        return "Failed to create member account. Please try again later.";
    }
}


// test Member login
app.post('/test/login/member', async (req, res) => {
    try {
        const result = await testmemberLogin(req.body.idproof, req.body.password);
        if (result.message === 'Correct password') {
            const token = generateToken({ idproof: req.body.idproof, role: 'test-member', memberName: result.user.memberName });
            res.send({ message: 'Successful login. Welcome to YOMOM CYBERCAFE', token });
        } else {
            res.send('Login unsuccessful');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

async function testmemberLogin(idproof, password) {
    try {
        console.log('Received login request for test-member:', idproof);
        let matchUser = await client.db('cybercafe').collection('customer').findOne({ idproof: idproof });

        if (!matchUser) {
            return { message: 'User not found!' };
        }

        // Consider using a library like bcrypt to compare hashed passwords
        if (matchUser.password === password) {
            return { message: 'Correct password', user: matchUser };
        } else {
            return { message: 'Invalid password' };
        }
    } catch (error) {
        console.error(error);
        return { message: 'Internal Server Error' };
    }
}

// test-Member create visitor
app.post('/test/create/visitor', verifyTokenAndRole('test-member'), async (req, res) => {
    try {
        console.log(req.user)
        const membername = req.user.memberName;

        // Call the modified createVisitor function
        let result = await testcreateVisitor(
            membername,
            req.body.visitorname,
            req.body.idProof
        );

        // Check the result and send an appropriate response
        if (result.startsWith("Visitor account has been created")) {
            res.send(result);
        } else {
            // Handle the case where the member has reached the maximum limit
            res.status(400).send(result);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});
async function testcreateVisitor(memberName, visitorName) {
    try {
        console.log('MemberName:', memberName);
        const visitorData = {
            visitorname: visitorName,
            entrytime: 0,
            cabinno: 0,  
            computername: ""
        }
        await client.db('cybercafe').collection('customer').updateOne(
            { memberName },
            { $push: { visitors: visitorData } }
        );

        return "Visitor account has been created. Welcome to YOMOM Cybercafe! :D";
    } catch (error) {
        console.error(error);
        return "Failed to create visitor account. Please try again later.";
    }
}

function generateToken(userData) {
    const token = jwt.sign(
        userData,
        'password',
        { expiresIn: 600 }
    );

    console.log(token);

    return token;
}

function isPasswordStrong(password) {
    const minLength = 10;
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^.()])[A-Za-z\d@$!%*?&^.()]{10,}$/;
  
    return password.length >= minLength && regex.test(password);
  }
  

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
