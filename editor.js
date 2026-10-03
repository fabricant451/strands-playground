const $ = (id) => document.getElementById(id);
const initial = [
  {name:'department', type:'choice', instructions:'Which team should handle this?', options:[['billing',''],['sales',''],['retail','']]},
  {name:'urgent', type:'noul', instructions:'Does this convey urgency?', options:[]},
  {name:'frustration', type:'score', instructions:'How frustrated is the writer?', options:[['Not at all frustrated',''],['Slightly frustrated',''],['Moderately frustrated',''],['Quite frustrated',''],['Very frustrated','']]},
];
let serial = 0;
function field(label, control) {
  const box = document.createElement('div');
  const text = document.createElement('label');
  control.id = `field-${++serial}`; text.htmlFor = control.id; text.textContent = label;
  box.append(text, control); return box;
}
function input(value, placeholder, label) {
  const el = document.createElement('input');
  el.value = value; el.placeholder = placeholder; el.setAttribute('aria-label', label); return el;
}
export function addQuestion(data = {name:'', type:'choice', instructions:'', options:[['',''],['','']]}) {
  const card = document.createElement('article'); card.className = 'question-card';
  card.innerHTML = '<div class="question-top"><span class="question-number"></span><button class="remove-question" type="button">Remove question</button></div><div class="question-fields"></div><div class="prompt-field"></div><div class="option-fields"></div>';
  const name = input(data.name, 'e.g. department', 'Question name'); name.className = 'question-name';
  const type = document.createElement('select'); type.className = 'question-type';
  for (const [value, label] of [['choice','Choice'],['noul','Yes / No'],['score','Scale']]) type.add(new Option(label, value));
  type.value = data.type;
  card.querySelector('.question-fields').append(field('Name', name), field('Answer type', type));
  const prompt = document.createElement('textarea'); prompt.className = 'instructions'; prompt.rows = 2;
  prompt.value = data.instructions; prompt.placeholder = 'What would you like to know?';
  card.querySelector('.prompt-field').append(field('Question', prompt));
  const container = card.querySelector('.option-fields');
  const saved = {choice: data.type === 'choice' ? data.options : [['',''],['','']], score: data.type === 'score' ? data.options : [['Low',''],['High','']]};
  let previous = data.type;
  function renderOptions(values) {
    container.replaceChildren();
    if (type.value === 'noul') {
      const hint = document.createElement('p'); hint.className = 'bool-explanation'; hint.textContent = 'The model estimates how likely the answer is yes.'; container.append(hint); return;
    }
    const scale = type.value === 'score';
    const caption = document.createElement('div'); caption.className = 'options-title';
    caption.textContent = scale ? 'Scale levels · lowest to highest (2–10)' : 'Options · label and optional description';
    const rows = document.createElement('div'); rows.className = 'option-rows';
    const add = document.createElement('button'); add.className = 'add-option'; add.type = 'button'; add.textContent = scale ? '+ Add level' : '+ Add option';
    function updateRows() {
      [...rows.children].forEach((row,i)=>{
        row.querySelector('.remove-option').disabled = rows.children.length <= 2;
        row.querySelector('.remove-option').setAttribute('aria-label', `Remove ${scale ? 'level' : 'option'} ${i+1}`);
        if (scale) row.querySelector('.level-index').textContent = i;
      });
      add.disabled = scale && rows.children.length >= 10;
    }
    function addRow(value=['','']) {
      const row = document.createElement('div'); row.className = 'option-editor';
      if (scale) { const number = document.createElement('span'); number.className = 'level-index'; row.append(number); }
      const label = input(value[0], scale ? 'Level label' : 'Option label', scale ? 'Level label' : 'Option label'); label.className = 'option-label'; row.append(label);
      if (!scale) { const description = input(value[1], 'Description (optional)', 'Option description'); description.className = 'description'; row.append(description); }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-option'; remove.textContent = '×';
      remove.onclick = ()=>{row.remove(); updateRows(); changed();}; row.append(remove); rows.append(row); updateRows(); return label;
    }
    for (const value of values) addRow(value);
    add.onclick = ()=>{addRow().focus(); changed();};
    container.append(caption, rows, add);
  }
  type.onchange = ()=>{
    if (previous !== 'noul') saved[previous] = readOptions(card);
    previous = type.value; renderOptions(saved[type.value] || []); changed();
  };
  card.querySelector('.remove-question').onclick = ()=>{card.remove(); renumber(); changed(); $('add-question').focus();};
  renderOptions(data.options); $('questions').append(card); renumber(); changed(); return card;
}
function readOptions(card) {
  return [...card.querySelectorAll('.option-editor')].map(row=>[row.querySelector('.option-label').value, row.querySelector('.description')?.value || '']);
}
function renumber() {
  const cards = [...$('questions').children]; $('question-count').textContent = cards.length;
  cards.forEach((card,i)=>card.querySelector('.question-number').textContent = `Question ${String(i+1).padStart(2,'0')}`);
}
export function getRequest() {
  const questions = Object.create(null);
  const cards = [...$('questions').children];
  if (!cards.length) throw new Error('Add at least one question.');
  for (const [i,card] of cards.entries()) {
    const name = card.querySelector('.question-name').value.trim();
    const instructions = card.querySelector('.instructions').value.trim();
    const type = card.querySelector('.question-type').value;
    if (!name) throw new Error(`Give question ${i+1} a name.`);
    if (Object.hasOwn(questions,name)) throw new Error(`Question names must be unique: “${name}”.`);
    if (!instructions) throw new Error(`Write a question for “${name}”.`);
    const question = {type,instructions};
    if (type !== 'noul') {
      const options = readOptions(card).map(([label,description])=>[label.trim(),description.trim()]);
      if (options.some(([label])=>!label)) throw new Error(`Fill in every ${type === 'score' ? 'level' : 'option'} for “${name}”.`);
      if (new Set(options.map(([label])=>label)).size !== options.length) throw new Error(`Use distinct option labels for “${name}”.`);
      question.criteria = type === 'score' ? options.map(([label])=>label) : Object.fromEntries(options.map(([label,description])=>[label,description || null]));
    }
    questions[name] = question;
  }
  return {state:$('state').value,questions};
}
function changed() {
  $('request-error').hidden = true;
  try { $('request-json').textContent = JSON.stringify(getRequest(), null, 2); }
  catch (error) { $('request-json').textContent = error.message; }
  document.dispatchEvent(new Event('requestchange'));
}
export function resetExample() {
  $('questions').replaceChildren(); $('state').value = 'Help! My payouts have been failing for 3 days!';
  for (const question of initial) addQuestion(question);
  changed();
}
$('questions').addEventListener('input', changed);
$('state').addEventListener('input', changed);
$('add-question').onclick = ()=>addQuestion().querySelector('.question-name').focus();
$('example').onclick = resetExample;
resetExample();
