function _hello() {
  console.log('Hello, world!');
  return 42;
}

async function _fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}

class _TestClass {
  constructor() {
    this.value = 100;
  }

  method() {
    return this.value;
  }
}

const _arrowFunc = () => {
  console.log('arrow');
};
